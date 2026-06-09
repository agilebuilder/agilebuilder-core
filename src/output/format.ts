import chalk from 'chalk';
import { AppError, toAppError } from '../errors/app-error.js';
import { t } from '../i18n/index.js';

export interface OutputOptions {
  json?: boolean;
}

export type TextRenderer<T> = (data: T) => string;

export function writeOutput(value: unknown, options: OutputOptions = {}): void {
  if (options.json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  if (typeof value === 'string') {
    console.log(value);
    return;
  }

  console.log(JSON.stringify(value, null, 2));
}

export function writeSuccess<T>(
  data: T,
  options: OutputOptions = {},
  renderText?: TextRenderer<T>,
): void {
  if (options.json) {
    writeOutput({ ok: true, data }, options);
    return;
  }
  if (renderText) {
    writeOutput(renderText(data), options);
    return;
  }
  writeOutput(data, options);
}

export function printError(error: unknown, options: OutputOptions = {}): void {
  const appError = toAppError(error);
  if (options.json) {
    console.error(JSON.stringify({
      ok: false,
      error: {
        code: appError.code,
        message: appError.message,
        suggestion: appError.suggestion,
        category: appError.category,
        details: appError.details,
      },
    }, null, 2));
    return;
  }

  console.error(chalk.red(`${t('common.error')}: ${appError.message}`));
  if (appError.suggestion) {
    console.error(chalk.dim(appError.suggestion));
  }
}

export function getExitCode(error: unknown): number {
  return error instanceof AppError ? error.exitCode : 1;
}
