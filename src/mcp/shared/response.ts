import { mapMCPError } from '../context.js';
import type { MCPToolResponse } from '../../shared/types.js';

export function createMCPErrorResponse<T = never>(error: MCPToolResponse['error']): MCPToolResponse<T> {
  return {
    success: false,
    error,
  };
}

export function createMCPSuccessResponse<T>(data: T): MCPToolResponse<T> {
  return {
    success: true,
    data,
  };
}

export function createMappedMCPError(
  error: unknown,
  fallback: {
    code: string;
    message: string;
    suggestion?: string;
    category?: 'auth' | 'permission' | 'network' | 'validation' | 'resource' | 'system';
    retryable?: boolean;
    metadata?: Record<string, any>;
  }
): NonNullable<MCPToolResponse['error']> {
  const mapped = mapMCPError(error, fallback);
  return {
    code: mapped?.code || fallback.code,
    message: mapped?.message || fallback.message,
    suggestion: mapped?.suggestion,
    details: mapped?.details,
    category: mapped?.category || fallback.category,
    retryable: mapped?.retryable,
    metadata: fallback.metadata,
  };
}

export function createTextToolResult<T>(response: MCPToolResponse<T>): {
  content: Array<{ type: string; text: string }>;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
  };
}
