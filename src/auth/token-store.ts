/**
 * Token secure storage and refresh handling.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { appendStructuredLog } from '../shared/file-logger.js';
import { getAuthFilePath, getAuthRefreshLogFilePath } from '../shared/paths.js';
import { getSsoBaseUrl, TOKEN_REFRESH_THRESHOLD } from '../shared/constants.js';
import { proxyFetch } from '../shared/http-client.js';
import { t } from '../i18n/index.js';
import type { AuthData, OAuthTokenResponse, UserInfo } from '../shared/types.js';

const AUTH_NETWORK_TIMEOUT_MS = 10000;
const DEFAULT_TOKEN_EXPIRES_IN_SECONDS = 3600;

class TokenRefreshError extends Error {
  constructor(
    message: string,
    public readonly category: 'network' | 'invalid_grant' | 'server' | 'response' = 'server',
    public readonly shouldClearAuth: boolean = false,
  ) {
    super(message);
    this.name = 'TokenRefreshError';
  }
}

function summarizeJwtPayload(jwtPayload: Record<string, any> | null): Record<string, any> | string {
  if (!jwtPayload) {
    return 'Not a JWT';
  }

  return {
    hasSub: typeof jwtPayload.sub === 'string',
    hasUserId: typeof jwtPayload.userId === 'string',
    hasEmail: typeof jwtPayload.email === 'string',
    hasMobile: typeof jwtPayload.mobile === 'string',
    keys: Object.keys(jwtPayload),
  };
}

function summarizeSsoResponse(result: Record<string, any>): Record<string, any> {
  const data = result.data || result;

  return {
    success: result.success,
    hasError: !!result.error,
    keys: Object.keys(data || {}),
  };
}

function normalizeTokenResponse(result: Record<string, any>): Partial<OAuthTokenResponse> {
  const data = result.data || result;
  return (data && typeof data === 'object' ? data : {}) as Partial<OAuthTokenResponse>;
}

function summarizeResponseError(result: Record<string, any>): string {
  return valueAsString(result.message)
    || valueAsString(result.error)
    || valueAsString(result.data?.message)
    || valueAsString(result.data?.error)
    || '';
}

function classifyRefreshPayloadFailure(
  result: Record<string, any>,
): { category: TokenRefreshError['category']; shouldClearAuth: boolean; message: string } {
  const details = summarizeResponseError(result);
  const lowerDetails = details.toLowerCase();
  const code = typeof result.code === 'number' ? result.code : null;

  if (
    code === 1001
    || lowerDetails.includes('invalid_grant')
    || lowerDetails.includes('refresh token')
    || lowerDetails.includes('refreshtoken')
  ) {
    return {
      category: 'invalid_grant',
      shouldClearAuth: true,
      message: details || t('auth.tokenRefreshFailed'),
    };
  }

  if (result.success === false || result.error || result.message) {
    return {
      category: 'response',
      shouldClearAuth: false,
      message: details || t('auth.tokenRefreshFailed'),
    };
  }

  return {
    category: 'response',
    shouldClearAuth: false,
    message: t('auth.tokenRefreshFailed'),
  };
}

function valueAsString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getUserIdentity(source: Record<string, any>): string | undefined {
  return valueAsString(source.sub)
    || valueAsString(source.userId)
    || valueAsString(source.email)
    || valueAsString(source.mobile);
}

function getUserDisplayName(source: Record<string, any>): string | undefined {
  return valueAsString(source.showName)
    || valueAsString(source.displayName)
    || valueAsString(source.name)
    || valueAsString(source.nickname)
    || valueAsString(source.userName)
    || valueAsString(source.username)
    || valueAsString(source.preferred_username)
    || valueAsString(source.email)
    || valueAsString(source.mobile)
    || valueAsString(source.phone);
}

function isPlaceholderUserName(name: string | undefined): boolean {
  return name === t('auth.userUnknown') || name === t('auth.defaultUser');
}

function mergeUserInfoWithFallback(nextUser: UserInfo, currentUser: UserInfo): UserInfo {
  return {
    id: nextUser.id || currentUser.id,
    email: nextUser.email || currentUser.email,
    mobile: nextUser.mobile || currentUser.mobile,
    avatar: nextUser.avatar || currentUser.avatar,
    name: !nextUser.name || isPlaceholderUserName(nextUser.name)
      ? currentUser.name
      : nextUser.name,
  };
}

function toSafeIsoString(timestamp: unknown): string | null {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return null;
  }

  const date = new Date(timestamp);
  const time = date.getTime();
  if (!Number.isFinite(time)) {
    return null;
  }

  return date.toISOString();
}

function deriveKey(): Buffer {
  const machineId = `${homedir()}:${process.platform}:${process.arch}`;
  return createHash('sha256')
    .update(`agilebuilder:auth:${machineId}`)
    .digest();
}

export class TokenStore {
  private static refreshPromise: Promise<AuthData> | null = null;

  private static logRefreshEvent(
    level: 'log' | 'warn' | 'error',
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    if (process.env.DEBUG) {
      const logger = console[level] ?? console.log;
      if (metadata) {
        logger('[Auth] Token refresh:', message, metadata);
      } else {
        logger('[Auth] Token refresh:', message);
      }
    }

    appendStructuredLog(getAuthRefreshLogFilePath(), level, 'auth.token-refresh', message, metadata);
  }

  private static classifyRefreshFailure(
    status: number,
    details: string,
  ): { category: TokenRefreshError['category']; shouldClearAuth: boolean } {
    const lowerDetails = details.toLowerCase();

    if (status === 400 || status === 401) {
      if (lowerDetails.includes('invalid_grant') || lowerDetails.includes('refresh token')) {
        return { category: 'invalid_grant', shouldClearAuth: true };
      }

      return { category: 'server', shouldClearAuth: true };
    }

    return { category: 'server', shouldClearAuth: false };
  }

  static save(auth: AuthData): void {
    const authFile = getAuthFilePath();
    const dir = dirname(authFile);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const key = deriveKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);

    const jsonStr = JSON.stringify(auth);
    let encrypted = cipher.update(jsonStr, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const tempFile = join(dir, `auth-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}.tmp`);
    writeFileSync(tempFile, `${iv.toString('base64')}:${encrypted}`, 'utf-8');
    renameSync(tempFile, authFile);
  }

  static load(): AuthData | null {
    const authFile = getAuthFilePath();

    if (!existsSync(authFile)) {
      return null;
    }

    try {
      const content = readFileSync(authFile, 'utf-8');
      if (!content || !content.includes(':')) {
        return null;
      }

      const [ivBase64, encrypted] = content.split(':');
      const key = deriveKey();
      const iv = Buffer.from(ivBase64, 'base64');
      const decipher = createDecipheriv('aes-256-cbc', key, iv);

      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted) as AuthData;
    } catch {
      return null;
    }
  }

  static clear(): void {
    const authFile = getAuthFilePath();

    if (existsSync(authFile)) {
      unlinkSync(authFile);
    }
  }

  private static clearIfMatching(expectedRefreshToken: string): void {
    const currentAuth = this.load();
    if (!currentAuth || currentAuth.refreshToken !== expectedRefreshToken) {
      return;
    }

    this.clear();
  }

  static isAuthenticated(): boolean {
    return this.load() !== null;
  }

  static isTokenExpired(): boolean {
    const auth = this.load();
    if (!auth) return true;
    return Date.now() >= auth.expiresAt;
  }

  static isTokenExpiringSoon(): boolean {
    const auth = this.load();
    if (!auth) return true;
    return Date.now() >= auth.expiresAt - TOKEN_REFRESH_THRESHOLD;
  }

  static getUser(): UserInfo | null {
    const auth = this.load();
    return auth?.user ?? null;
  }

  static getAccessToken(): string | null {
    const auth = this.load();
    return auth?.accessToken ?? null;
  }

  static async getValidToken(): Promise<string | null> {
    const auth = this.load();
    if (!auth) return null;

    if (!this.isTokenExpiringSoon()) {
      return auth.accessToken;
    }

    if (Date.now() < auth.expiresAt) {
      void this.refreshTokenInBackground(auth);
      return auth.accessToken;
    }

    try {
      const newAuth = await this.refreshTokenInBackground(auth);
      return newAuth.accessToken;
    } catch (error) {
      if (error instanceof TokenRefreshError && error.shouldClearAuth) {
        this.clearIfMatching(auth.refreshToken);
      }

      return null;
    }
  }

  static async forceRefreshToken(): Promise<string | null> {
    const auth = this.load();
    if (!auth) return null;

    try {
      const newAuth = await this.refreshTokenInBackground(auth);
      return newAuth.accessToken;
    } catch (error) {
      if (error instanceof TokenRefreshError && error.shouldClearAuth) {
        this.clearIfMatching(auth.refreshToken);
      }

      return null;
    }
  }

  private static async refreshTokenInBackground(auth: AuthData): Promise<AuthData> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshToken(auth)
        .then((newAuth) => {
          this.logRefreshEvent('log', 'succeeded');
          this.save(newAuth);
          return newAuth;
        })
        .catch((error) => {
          if (error instanceof TokenRefreshError) {
            this.logRefreshEvent(
              error.shouldClearAuth ? 'warn' : 'error',
              'failed',
              {
                category: error.category,
                shouldClearAuth: error.shouldClearAuth,
                message: error.message,
              },
            );
          }

          throw error;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }

    return this.refreshPromise;
  }

  static async hasValidSession(): Promise<boolean> {
    const auth = this.load();
    if (!auth) {
      return false;
    }

    const token = await this.getValidToken();
    return !!token;
  }

  private static async refreshToken(currentAuth: AuthData): Promise<AuthData> {
    let response: Response;

    this.logRefreshEvent('log', 'started', {
      expiresAt: toSafeIsoString(currentAuth.expiresAt),
      expiresAtRaw: currentAuth.expiresAt,
      expiresInMs: typeof currentAuth.expiresAt === 'number' ? currentAuth.expiresAt - Date.now() : null,
      hasRefreshToken: typeof currentAuth.refreshToken === 'string' && currentAuth.refreshToken.length > 0,
    });

    try {
      response = await proxyFetch(`${getSsoBaseUrl()}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: currentAuth.refreshToken,
          client_id: 'agilebuilder-cli',
        }),
        timeoutMs: AUTH_NETWORK_TIMEOUT_MS,
      });
    } catch (error) {
      throw new TokenRefreshError(
        error instanceof Error ? error.message : t('auth.tokenRefreshFailed'),
        'network',
        false,
      );
    }

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      const classified = this.classifyRefreshFailure(response.status, details);
      throw new TokenRefreshError(
        details || t('auth.tokenRefreshFailed'),
        classified.category,
        classified.shouldClearAuth,
      );
    }

    const rawResult = await response.json() as Record<string, any>;
    const tokenData = normalizeTokenResponse(rawResult);

    if (process.env.DEBUG) {
      this.logRefreshEvent('log', 'response summary', {
        httpStatus: response.status,
        summary: summarizeSsoResponse(rawResult),
      });
    }

    if (!tokenData.access_token) {
      const classified = classifyRefreshPayloadFailure(rawResult);
      throw new TokenRefreshError(classified.message, classified.category, classified.shouldClearAuth);
    }

    let userInfo = currentAuth.user;
    try {
      const refreshedUserInfo = await this.fetchUserInfo(tokenData.access_token);
      userInfo = mergeUserInfoWithFallback(refreshedUserInfo, currentAuth.user);
    } catch (error) {
      this.logRefreshEvent('warn', 'userinfo fallback', {
        message: error instanceof Error ? error.message : 'unknown error',
      });
    }

    const expiresInSeconds = typeof tokenData.expires_in === 'number' && tokenData.expires_in > 0
      ? tokenData.expires_in
      : DEFAULT_TOKEN_EXPIRES_IN_SECONDS;

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || currentAuth.refreshToken,
      expiresAt: Date.now() + expiresInSeconds * 1000,
      user: userInfo,
    };
  }

  private static parseJwtPayload(token: string): Record<string, any> | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = parts[1];
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const jsonStr = Buffer.from(base64, 'base64').toString('utf-8');
      return JSON.parse(jsonStr) as Record<string, any>;
    } catch {
      return null;
    }
  }

  static async fetchUserInfo(accessToken: string): Promise<UserInfo> {
    const jwtPayload = this.parseJwtPayload(accessToken);

    if (process.env.DEBUG) {
      console.log('[DEBUG] JWT payload summary:', JSON.stringify(summarizeJwtPayload(jwtPayload), null, 2));
    }

    if (jwtPayload) {
      const userId = valueAsString(jwtPayload.sub) || valueAsString(jwtPayload.userId) || valueAsString(jwtPayload.id) || '';
      const displayName = getUserDisplayName(jwtPayload);

      if (getUserIdentity(jwtPayload) && displayName) {
        return {
          id: userId,
          email: valueAsString(jwtPayload.email),
          mobile: valueAsString(jwtPayload.mobile) || valueAsString(jwtPayload.phone),
          name: displayName,
          avatar: valueAsString(jwtPayload.avatar) || valueAsString(jwtPayload.picture),
        };
      }
    }

    const endpoints = [
      '/oauth/userinfo',
      '/api/user/profile',
    ];

    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        const response = await proxyFetch(`${getSsoBaseUrl()}${endpoint}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          timeoutMs: AUTH_NETWORK_TIMEOUT_MS,
        });

        const result = await response.json() as Record<string, any>;

        if (process.env.DEBUG) {
          console.log(`[DEBUG] SSO ${endpoint} response summary:`, JSON.stringify(summarizeSsoResponse(result), null, 2));
        }

        if (result.success === false || result.error) {
          lastError = new Error(result.message || result.error || t('common.unknownError'));
          continue;
        }

        const userData = result.data || result;
        const displayName = getUserDisplayName(userData);
        return {
          id: valueAsString(userData.id) || valueAsString(userData.sub) || valueAsString(userData.userId) || '',
          email: valueAsString(userData.email),
          mobile: valueAsString(userData.mobile) || valueAsString(userData.phone) || valueAsString(userData.phone_number),
          name: displayName || t('auth.userUnknown'),
          avatar: valueAsString(userData.avatar) || valueAsString(userData.avatarUrl) || valueAsString(userData.picture),
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(t('common.unknownError'));
      }
    }

    if (jwtPayload) {
      return {
        id: jwtPayload.sub || jwtPayload.jti || 'unknown',
        name: t('auth.defaultUser'),
      };
    }

    throw lastError || new Error(t('auth.fetchUserInfoFailed'));
  }
}
