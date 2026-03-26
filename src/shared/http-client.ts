/**
 * HTTP helper with optional proxy and request timeout support.
 *
 * Usage:
 * 1. Set AG_PROXY=http://127.0.0.1:9099 in .env.local when debugging traffic.
 * 2. All requests sent through proxyFetch will use that proxy.
 * 3. Leave AG_PROXY unset in normal environments.
 */

import { ProxyAgent, fetch as undiciFetch } from 'undici';

export interface ProxyFetchOptions extends RequestInit {
  timeoutMs?: number;
}

// Reuse a single proxy agent instance across requests.
let cachedProxyAgent: ProxyAgent | null = null;

function maskProxyUrl(proxyUrl: string): string {
  try {
    const parsed = new URL(proxyUrl);
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${parsed.hostname}${port}`;
  } catch {
    return '[invalid-proxy-url]';
  }
}

function getProxyUrl(): string | undefined {
  return process.env.AG_PROXY;
}

function getProxyAgent(): ProxyAgent | null {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return null;

  if (!cachedProxyAgent) {
    cachedProxyAgent = new ProxyAgent(proxyUrl);
    if (process.env.DEBUG) {
      console.log(`[HTTP] Proxy enabled: ${maskProxyUrl(proxyUrl)}`);
    }
  }

  return cachedProxyAgent;
}

/**
 * Fetch wrapper with optional proxy and timeout support.
 */
export async function proxyFetch(
  url: string | URL,
  options: ProxyFetchOptions = {}
): Promise<Response> {
  const { timeoutMs, signal, ...requestOptions } = options;
  const proxyAgent = getProxyAgent();
  const controller = timeoutMs && timeoutMs > 0 ? new AbortController() : null;
  const cleanupTasks: Array<() => void> = [];

  if (signal && controller) {
    if (signal.aborted) {
      controller.abort((signal as AbortSignal & { reason?: unknown }).reason);
    } else {
      const abortHandler = () => controller.abort((signal as AbortSignal & { reason?: unknown }).reason);
      signal.addEventListener('abort', abortHandler, { once: true });
      cleanupTasks.push(() => signal.removeEventListener('abort', abortHandler));
    }
  }

  const timeoutId = controller
    ? setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
    : null;

  if (timeoutId) {
    timeoutId.unref?.();
    cleanupTasks.push(() => clearTimeout(timeoutId));
  }

  const finalOptions: RequestInit = {
    ...requestOptions,
    signal: controller?.signal ?? signal,
  };

  try {
    if (proxyAgent) {
      return undiciFetch(url, {
        ...finalOptions,
        dispatcher: proxyAgent,
      } as any) as unknown as Response;
    }

    return fetch(url, finalOptions);
  } finally {
    for (const cleanup of cleanupTasks) {
      cleanup();
    }
  }
}

export function isProxyEnabled(): boolean {
  return !!getProxyUrl();
}
