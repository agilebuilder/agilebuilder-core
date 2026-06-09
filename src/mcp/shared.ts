import { AppError, toAppError } from '../errors/app-error.js';

export function toolResult(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function errorResult(error: unknown) {
  const appError = toAppError(error);
  return toolResult({
    ok: false,
    error: {
      code: appError.code,
      message: appError.message,
      suggestion: appError.suggestion,
      category: appError.category,
      details: appError.details,
    },
  });
}

export function parseType(value: unknown): 'template' | 'doc' | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'template' || value === 'doc') return value;
  throw new AppError({ code: 'INVALID_RESOURCE_TYPE', message: `Invalid resource type: ${String(value)}`, category: 'validation' });
}
