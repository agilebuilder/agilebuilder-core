import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { AppError } from '../errors/app-error.js';
import { getDataDir } from '../shared/paths.js';
import { getBackendEndpoints } from '../client/backend.js';
import type { ApiKeyAuthData, AuthData, OAuthAuthData, OAuthTokenResponse, UserInfo } from './types.js';

const TOKEN_REFRESH_THRESHOLD_MS = 60_000;

function getAuthFilePath(): string {
  return join(getDataDir(), 'auth.enc');
}

function deriveKey(): Buffer {
  return createHash('sha256')
    .update(`agilebuilder-core1:${homedir()}:${process.platform}:${process.arch}`)
    .digest();
}

function encrypt(value: AuthData): string {
  const key = deriveKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(JSON.stringify(value), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return `${iv.toString('base64')}:${encrypted}`;
}

function decrypt(content: string): AuthData | null {
  try {
    const [ivBase64, encrypted] = content.split(':');
    const decipher = createDecipheriv('aes-256-cbc', deriveKey(), Buffer.from(ivBase64, 'base64'));
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return normalizeAuth(JSON.parse(decrypted));
  } catch {
    return null;
  }
}

function normalizeAuth(value: unknown): AuthData | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Partial<AuthData>;
  if (raw.authType === 'apiKey' && typeof (raw as ApiKeyAuthData).apiKey === 'string') {
    return {
      authType: 'apiKey',
      apiKey: (raw as ApiKeyAuthData).apiKey,
      createdAt: typeof (raw as ApiKeyAuthData).createdAt === 'number' ? (raw as ApiKeyAuthData).createdAt : Date.now(),
      user: (raw as ApiKeyAuthData).user,
    };
  }
  if (
    raw.authType === 'oauth' &&
    typeof (raw as OAuthAuthData).accessToken === 'string' &&
    typeof (raw as OAuthAuthData).refreshToken === 'string'
  ) {
    return {
      authType: 'oauth',
      accessToken: (raw as OAuthAuthData).accessToken,
      refreshToken: (raw as OAuthAuthData).refreshToken,
      expiresAt: typeof (raw as OAuthAuthData).expiresAt === 'number' ? (raw as OAuthAuthData).expiresAt : 0,
      user: (raw as OAuthAuthData).user || { id: '', name: 'User' },
    };
  }
  return null;
}

function normalizeUser(value: Record<string, unknown> | undefined): UserInfo {
  if (!value) {
    return { id: '', name: 'User' };
  }
  return {
    id: String(value.id || value.userId || value.sub || ''),
    name: String(value.name || value.displayName || value.showName || value.username || value.email || 'User'),
    email: typeof value.email === 'string' ? value.email : undefined,
    mobile: typeof value.mobile === 'string' ? value.mobile : undefined,
    avatar: typeof value.avatar === 'string' ? value.avatar : undefined,
  };
}

let refreshPromise: Promise<OAuthAuthData> | null = null;

export class TokenStore {
  static save(auth: AuthData): void {
    const filePath = getAuthFilePath();
    mkdirSync(dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, encrypt(auth), 'utf8');
    renameSync(tempPath, filePath);
  }

  static load(): AuthData | null {
    const filePath = getAuthFilePath();
    if (!existsSync(filePath)) {
      return null;
    }
    return decrypt(readFileSync(filePath, 'utf8'));
  }

  static clear(): void {
    const filePath = getAuthFilePath();
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  static getUser(): UserInfo | null {
    return this.load()?.user ?? null;
  }

  static saveApiKey(apiKey: string, user?: UserInfo): void {
    this.save({ authType: 'apiKey', apiKey, user, createdAt: Date.now() });
  }

  static saveOAuth(token: OAuthTokenResponse): OAuthAuthData {
    if (!token.access_token) {
      throw new AppError({
        code: 'OAUTH_TOKEN_INVALID',
        message: 'OAuth token response did not include access_token.',
        category: 'auth',
      });
    }
    const auth: OAuthAuthData = {
      authType: 'oauth',
      accessToken: token.access_token,
      refreshToken: token.refresh_token || '',
      expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      user: normalizeUser(token.user),
    };
    this.save(auth);
    return auth;
  }

  static async getValidToken(): Promise<string | null> {
    const auth = this.load();
    if (!auth) {
      return null;
    }
    if (auth.authType === 'apiKey') {
      return auth.apiKey;
    }
    if (Date.now() < auth.expiresAt - TOKEN_REFRESH_THRESHOLD_MS) {
      return auth.accessToken;
    }
    try {
      const refreshed = await this.refreshOAuth(auth);
      return refreshed.accessToken;
    } catch {
      return Date.now() < auth.expiresAt ? auth.accessToken : null;
    }
  }

  private static async refreshOAuth(auth: OAuthAuthData): Promise<OAuthAuthData> {
    if (!auth.refreshToken) {
      throw new AppError({ code: 'OAUTH_REFRESH_UNAVAILABLE', message: 'OAuth refresh token is unavailable.', category: 'auth' });
    }
    refreshPromise ??= this.requestRefresh(auth).finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  private static async requestRefresh(auth: OAuthAuthData): Promise<OAuthAuthData> {
    const response = await fetch(`${getBackendEndpoints().ssoApiUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: auth.refreshToken,
        client_id: 'agilebuilder-cli',
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new AppError({ code: `HTTP_${response.status}`, message: await response.text(), category: 'auth' });
    }
    const raw = await response.json() as Record<string, unknown>;
    const data = (raw.data || raw) as OAuthTokenResponse;
    const next: OAuthAuthData = {
      authType: 'oauth',
      accessToken: data.access_token,
      refreshToken: data.refresh_token || auth.refreshToken,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      user: data.user ? normalizeUser(data.user) : auth.user,
    };
    this.save(next);
    return next;
  }
}
