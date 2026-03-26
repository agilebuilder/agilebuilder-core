/**
 * Pro 模块下载器
 * 
 * 负责从 Workspace 后端下载 Pro 模块包
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { getProModulesDir, getProModuleFilePath } from '../shared/paths.js';
import { TokenStore } from '../auth/token-store.js';
import { getWorkspaceApiUrl, APP_VERSION, CLIENT_TYPE } from '../shared/constants.js';
import { getDeviceId } from '../license/device.js';
import { verifySignedDataResponse } from '../license/signature.js';
import { ProIntegrity } from './integrity.js';
import { ApiClient } from '../shared/api-client.js';
import { proxyFetch } from '../shared/http-client.js';
import type { ProModuleMeta, SignedProModuleMeta } from '../shared/types.js';
import { t } from '../i18n/index.js';

/**
 * 重试配置
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

const STARTUP_METADATA_TIMEOUT_MS = 3000;
const DOWNLOAD_FILE_TIMEOUT_MS = 15000;

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 计算指数退避延迟
 */
function getRetryDelay(attempt: number): number {
  const delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
  return Math.min(delayMs, RETRY_CONFIG.maxDelayMs);
}

type DownloadErrorCode =
  | 'AUTH_REQUIRED'
  | 'TOKEN_EXPIRED'
  | 'NO_PRO_ACCESS'
  | 'FETCH_VERSION_FAILED'
  | 'FETCH_DOWNLOAD_URL_FAILED'
  | 'DOWNLOAD_FILE_FAILED'
  | 'FILE_VALIDATION_FAILED'
  | 'UNKNOWN';

interface DownloadResult {
  success: boolean;
  version?: string;
  error?: string;
  errorCode?: DownloadErrorCode;
}

/**
 * Pro 模块版本响应（匹配后端 API 实际返回格式）
 */
interface ProVersionResponse {
  resourceType: string;
  platform: string;
  arch: string;
  currentVersion: string | null;
  latestVersion: string;           // 最新版本号（字符串）
  minVersion: string | null;       // 最低CLI版本要求
  needUpdate: boolean;             // 是否需要更新
  forceUpdate: boolean;            // 是否强制更新
  fileSize: number;
  sha256: string;
  changelog?: string;              // 更新日志（可选）
}

/**
 * Pro 模块下载链接响应
 */
interface ProDownloadResponse {
  downloadUrl: string;
  expiresAt: string;
  version: {
    version: string;
    fileSize: number;
    sha256: string;
  };
  manifest: SignedProModuleMeta;
}

/**
 * Pro 模块版本信息文件路径
 */
function getProVersionFilePath(): string {
  return join(getProModulesDir(), 'version.json');
}

/**
 * Pro 模块下载器
 */
export class ProDownloader {
  static needsDownload(): boolean {
    const modulePath = getProModuleFilePath();
    return !existsSync(modulePath);
  }
  
  /**
   * 获取本地 Pro 模块版本
   */
  static getLocalVersion(): string | null {
    return ProIntegrity.getMeta()?.version || null;
  }
  
  /**
   * 下载 Pro 模块
   *
   * 从 Cloud 下载加密模块（带重试机制）
   */
  static async download(): Promise<DownloadResult> {
    return this.downloadFromCloudWithRetry();
  }

  /**
   * 带重试机制的云端下载
   */
  private static async downloadFromCloudWithRetry(): Promise<DownloadResult> {
    let lastError = '';

    for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = getRetryDelay(attempt - 1);
        console.log(t('pro.downloadRetrying', {
          seconds: delayMs / 1000,
          attempt,
          maxRetries: RETRY_CONFIG.maxRetries - 1,
        }));
        await delay(delayMs);
      }

      const result = await this.downloadFromCloud();

      if (result.success) {
        return result;
      }

      lastError = result.error || 'Unknown error';

      // 某些错误不需要重试
      if (result.errorCode === 'TOKEN_EXPIRED' || result.errorCode === 'NO_PRO_ACCESS' || result.errorCode === 'AUTH_REQUIRED') {
        return result;
      }
    }

    return {
      success: false,
      error: t('pro.downloadRetryExhausted', { maxRetries: RETRY_CONFIG.maxRetries, error: lastError }),
      errorCode: 'UNKNOWN',
    };
  }
  
  /**
   * 获取通用请求头
   */
  private static getHeaders(token: string): Record<string, string> {
    return {
      'Authorization': `Bearer ${token}`,
      'X-Device-Id': getDeviceId(),
      'X-Client-Type': CLIENT_TYPE,
      'X-Client-Version': APP_VERSION,
    };
  }

  private static async fetchWithAuthRetry(
    url: string,
    token: string,
    timeoutMs: number,
  ): Promise<{
    response?: Response;
    token?: string;
    error?: string;
    errorCode?: DownloadErrorCode;
  }> {
    const send = async (accessToken: string) => proxyFetch(url, {
      headers: this.getHeaders(accessToken),
      timeoutMs,
    });

    const firstResponse = await send(token);
    if (firstResponse.status !== 401) {
      return {
        response: firstResponse,
        token,
      };
    }

    const refreshedToken = await TokenStore.forceRefreshToken();
    if (!refreshedToken) {
      return {
        error: t('auth.tokenExpiredOrMissing'),
        errorCode: 'TOKEN_EXPIRED',
      };
    }

    const retryResponse = await send(refreshedToken);
    if (retryResponse.status === 401) {
      return {
        error: t('auth.tokenExpiredOrMissing'),
        errorCode: 'TOKEN_EXPIRED',
      };
    }

    return {
      response: retryResponse,
      token: refreshedToken,
    };
  }
  
  /**
   * 从 Cloud 下载 Pro 模块
   * 
   * 对接后端 API:
   * - GET /api/client/pro-module/version
   * - GET /api/client/pro-module/download
   */
  private static async downloadFromCloud(): Promise<DownloadResult> {
    try {
      const token = await TokenStore.getValidToken();
      if (!token) {
        return {
          success: false,
          error: t('auth.tokenExpiredOrMissing'),
          errorCode: 'AUTH_REQUIRED',
        };
      }
      
      const baseUrl = getWorkspaceApiUrl();
      const currentVersion = this.getLocalVersion();
      
      // 1. 获取版本信息
      const versionUrl = `${baseUrl}/api/client/pro-module/version${currentVersion ? `?currentVersion=${currentVersion}` : ''}`;
      const versionFetch = await this.fetchWithAuthRetry(versionUrl, token, STARTUP_METADATA_TIMEOUT_MS);
      if (!versionFetch.response) {
        return {
          success: false,
          error: versionFetch.error || t('auth.tokenExpiredOrMissing'),
          errorCode: versionFetch.errorCode || 'TOKEN_EXPIRED',
        };
      }
      const versionRes = versionFetch.response;
      
      if (!versionRes.ok) {
        if (versionRes.status === 403) {
          return { success: false, error: t('pro.noAccess'), errorCode: 'NO_PRO_ACCESS' };
        }
        return {
          success: false,
          error: t('pro.fetchVersionFailedWithStatus', { status: versionRes.status }),
          errorCode: 'FETCH_VERSION_FAILED',
        };
      }
      
      const versionData = await versionRes.json() as { code: number; data: ProVersionResponse };
      if (versionData.code !== 0 || !versionData.data.latestVersion) {
        return { success: false, error: t('pro.fetchVersionFailed'), errorCode: 'FETCH_VERSION_FAILED' };
      }

      const versionInfo = versionData.data;

      // 2. 获取下载链接
      const downloadUrl = `${baseUrl}/api/client/pro-module/download?version=${versionInfo.latestVersion}`;
      const downloadFetch = await this.fetchWithAuthRetry(
        downloadUrl,
        versionFetch.token || token,
        STARTUP_METADATA_TIMEOUT_MS,
      );
      if (!downloadFetch.response) {
        return {
          success: false,
          error: downloadFetch.error || t('auth.tokenExpiredOrMissing'),
          errorCode: downloadFetch.errorCode || 'TOKEN_EXPIRED',
        };
      }
      const downloadRes = downloadFetch.response;
      
      if (!downloadRes.ok) {
        if (downloadRes.status === 403) {
          return { success: false, error: t('pro.noAccess'), errorCode: 'NO_PRO_ACCESS' };
        }
        return {
          success: false,
          error: t('pro.fetchDownloadUrlFailedWithStatus', { status: downloadRes.status }),
          errorCode: 'FETCH_DOWNLOAD_URL_FAILED',
        };
      }
      
      const downloadData = await downloadRes.json() as { code: number; data: ProDownloadResponse };
      if (downloadData.code !== 0) {
        return { success: false, error: t('pro.fetchDownloadUrlFailed'), errorCode: 'FETCH_DOWNLOAD_URL_FAILED' };
      }
      
      const manifestEnvelope = downloadData.data.manifest;
      if (!manifestEnvelope) {
        return {
          success: false,
          error: t('pro.manifestMissing'),
          errorCode: 'FETCH_DOWNLOAD_URL_FAILED',
        };
      }

      const manifestVerification = verifySignedDataResponse<ProModuleMeta>(manifestEnvelope);
      if (!manifestVerification.valid) {
        return {
          success: false,
          error: manifestVerification.error || t('pro.manifestSignatureInvalid'),
          errorCode: 'FILE_VALIDATION_FAILED',
        };
      }

      const manifest = manifestEnvelope.data;

      // 3. 下载文件
      const fileUrl = downloadData.data.downloadUrl.startsWith('http') 
        ? downloadData.data.downloadUrl 
        : `${baseUrl}${downloadData.data.downloadUrl}`;
      
      const fileFetch = await this.fetchWithAuthRetry(
        fileUrl,
        downloadFetch.token || versionFetch.token || token,
        DOWNLOAD_FILE_TIMEOUT_MS,
      );
      if (!fileFetch.response) {
        return {
          success: false,
          error: fileFetch.error || t('auth.tokenExpiredOrMissing'),
          errorCode: fileFetch.errorCode || 'TOKEN_EXPIRED',
        };
      }
      const fileRes = fileFetch.response;
      
      if (!fileRes.ok) {
        if (fileRes.status === 403) {
          return { success: false, error: t('pro.noAccess'), errorCode: 'NO_PRO_ACCESS' };
        }
        return {
          success: false,
          error: t('pro.downloadFileFailedWithStatus', { status: fileRes.status }),
          errorCode: 'DOWNLOAD_FILE_FAILED',
        };
      }
      
      const moduleCode = await fileRes.text();
      
      // 4. 验证 SHA256
      const actualHash = createHash('sha256').update(moduleCode).digest('hex');
      if (actualHash !== manifest.sha256) {
        return { success: false, error: t('pro.fileValidationFailedPartial'), errorCode: 'FILE_VALIDATION_FAILED' };
      }
      
      // 5. 保存文件
      const modulesDir = getProModulesDir();
      const modulePath = getProModuleFilePath();
      const versionPath = getProVersionFilePath();
      
      if (!existsSync(modulesDir)) {
        mkdirSync(modulesDir, { recursive: true });
      }
      
      writeFileSync(modulePath, moduleCode, 'utf-8');
      
      // 6. 保存签名后的 manifest
      writeFileSync(versionPath, JSON.stringify(manifestEnvelope, null, 2), 'utf-8');

      return {
        success: true,
        version: manifest.version,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
        errorCode: 'UNKNOWN',
      };
    }
  }
  
  /**
   * 检查更新
   *
   * 对接后端: GET /api/client/pro-module/version
   */
  static async checkUpdate(): Promise<{
    hasUpdate: boolean;
    currentVersion?: string;
      latestVersion?: string;
      forceUpdate?: boolean;
      changelog?: string;
      minCliVersion?: string;
    error?: string;
  }> {
    const currentVersion = this.getLocalVersion();
    
    const token = await TokenStore.getValidToken();
    if (!token) {
      return {
        hasUpdate: false,
        error: t('pro.notLoggedInReason'),
      };
    }
    
    const endpoint = `/api/client/pro-module/version${currentVersion ? `?currentVersion=${currentVersion}` : ''}`;
    const result = await ApiClient.get<ProVersionResponse>(endpoint, {
      token,
      timeout: STARTUP_METADATA_TIMEOUT_MS,
    });

    if (!result.success || !result.data) {
      return {
        hasUpdate: false,
        currentVersion: currentVersion || undefined,
        error: result.error,
      };
    }

    return {
      hasUpdate: result.data.needUpdate,
      currentVersion: currentVersion || undefined,
      latestVersion: result.data.latestVersion,
      forceUpdate: result.data.forceUpdate,
      changelog: result.data.changelog,
      minCliVersion: result.data.minVersion || undefined,
    };
  }
}
