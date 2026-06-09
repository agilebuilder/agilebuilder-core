import { APP_VERSION, CLIENT_TYPE } from '../shared/constants.js';
import { getDeviceId } from '../device/device-id.js';
import { AppError } from '../errors/app-error.js';
import { getBackendEndpoints } from './backend.js';

export interface ApiResult<T> {
  code: number;
  message: string;
  data: T;
}

export interface RequestOptions {
  token?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

function withTimeout(timeoutMs: number | undefined): AbortSignal | undefined {
  if (!timeoutMs) {
    return undefined;
  }
  return AbortSignal.timeout(timeoutMs);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new AppError({
        code: `HTTP_${response.status}`,
        message: text || response.statusText,
        category: response.status === 401 ? 'auth' : 'network',
      });
    }
    return text as T;
  }

  const json = await response.json() as ApiResult<T> | T;
  if (!response.ok) {
    throw new AppError({
      code: `HTTP_${response.status}`,
      message: (json as Partial<ApiResult<T>>).message || response.statusText,
      category: response.status === 401 ? 'auth' : 'network',
      details: json,
    });
  }

  if (
    json &&
    typeof json === 'object' &&
    'code' in json &&
    typeof (json as ApiResult<T>).code === 'number'
  ) {
    const result = json as ApiResult<T>;
    if (result.code !== 0) {
      throw new AppError({
        code: `API_${result.code}`,
        message: result.message,
        category: result.code === 40100 ? 'auth' : 'network',
        details: result.data,
      });
    }
    return result.data;
  }

  return json as T;
}

export class ClientHttp {
  static async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      'X-Device-Id': getDeviceId(),
      'X-Client-Type': CLIENT_TYPE,
      'X-Client-Version': APP_VERSION,
      ...options.headers,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    const url = `${getBackendEndpoints().workspaceUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: withTimeout(options.timeoutMs ?? 15000),
    });

    return parseResponse<T>(response);
  }

  static get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  static post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }
}
