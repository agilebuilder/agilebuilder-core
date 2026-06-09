export type ErrorCategory = 'auth' | 'permission' | 'network' | 'validation' | 'resource' | 'system';

export interface AppErrorOptions {
  code: string;
  message: string;
  suggestion?: string;
  category?: ErrorCategory;
  details?: unknown;
  exitCode?: number;
}

export class AppError extends Error {
  readonly code: string;
  readonly suggestion?: string;
  readonly category: ErrorCategory;
  readonly details?: unknown;
  readonly exitCode: number;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.suggestion = options.suggestion;
    this.category = options.category ?? 'system';
    this.details = options.details;
    this.exitCode = options.exitCode ?? 1;
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof Error) {
    return new AppError({
      code: 'UNEXPECTED_ERROR',
      message: error.message,
      category: 'system',
    });
  }
  return new AppError({
    code: 'UNEXPECTED_ERROR',
    message: String(error),
    category: 'system',
  });
}
