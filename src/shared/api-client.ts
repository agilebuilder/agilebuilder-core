/**
 * Unified API client with one-shot auth refresh retry.
 */

import { TokenStore } from '../auth/token-store.js';
import { getDeviceId } from '../license/device.js';
import { APP_VERSION, CLIENT_TYPE, getSsoBaseUrl, getWorkspaceApiUrl } from './constants.js';
import { proxyFetch } from './http-client.js';

export interface ApiResponse<T = unknown> {
  code: number;
  message?: string;
  data?: T;
}

export interface RequestResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  httpStatus?: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  token?: string;
  isSso?: boolean;
  timeout?: number;
}

interface ExecutedResponse {
  response: Response;
  tokenUsed?: string;
}

export class ApiClient {
  private static getCommonHeaders(token?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Device-Id': getDeviceId(),
      'X-Client-Type': CLIENT_TYPE,
      'X-Client-Version': APP_VERSION,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  private static getBaseUrl(isSso?: boolean): string {
    return isSso ? getSsoBaseUrl() : getWorkspaceApiUrl();
  }

  private static async execute(
    endpoint: string,
    options: RequestOptions,
    tokenOverride?: string,
  ): Promise<ExecutedResponse> {
    const {
      method = 'GET',
      body,
      headers: extraHeaders,
      token,
      isSso = false,
      timeout,
    } = options;

    const tokenUsed = tokenOverride ?? token;
    const url = `${this.getBaseUrl(isSso)}${endpoint}`;
    const headers = {
      ...this.getCommonHeaders(tokenUsed),
      ...extraHeaders,
    };

    const response = await proxyFetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      timeoutMs: timeout,
    });

    return { response, tokenUsed };
  }

  private static async parseResponse<T>(response: Response): Promise<RequestResult<T>> {
    if (!response.ok) {
      if (response.status === 401) {
        return {
          success: false,
          error: 'TOKEN_EXPIRED',
          httpStatus: 401,
        };
      }

      if (response.status === 403) {
        return {
          success: false,
          error: 'NO_PERMISSION',
          httpStatus: 403,
        };
      }

      return {
        success: false,
        error: `请求失败: ${response.status}`,
        httpStatus: response.status,
      };
    }

    const result = await response.json() as ApiResponse<T>;
    if (result.code !== 0) {
      return {
        success: false,
        error: result.message || `业务错误: ${result.code}`,
        httpStatus: response.status,
      };
    }

    return {
      success: true,
      data: result.data,
      httpStatus: response.status,
    };
  }

  static async request<T = unknown>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<RequestResult<T>> {
    try {
      const firstAttempt = await this.execute(endpoint, options);
      if (firstAttempt.response.status !== 401 || !options.token) {
        return this.parseResponse<T>(firstAttempt.response);
      }

      const refreshedToken = await TokenStore.forceRefreshToken();
      if (!refreshedToken) {
        return {
          success: false,
          error: 'TOKEN_EXPIRED',
          httpStatus: 401,
        };
      }

      if (process.env.DEBUG) {
        console.log('[ApiClient] Retrying request after forced token refresh:', endpoint);
      }

      const retried = await this.execute(endpoint, options, refreshedToken);
      return this.parseResponse<T>(retried.response);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  static async get<T = unknown>(
    endpoint: string,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ): Promise<RequestResult<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  static async post<T = unknown>(
    endpoint: string,
    body?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ): Promise<RequestResult<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  static async put<T = unknown>(
    endpoint: string,
    body?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ): Promise<RequestResult<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  static async delete<T = unknown>(
    endpoint: string,
    options: Omit<RequestOptions, 'method'> = {},
  ): Promise<RequestResult<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}
