import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const MAX_LOG_FILE_SIZE_BYTES = 1024 * 1024;

function ensureParentDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function rotateIfNeeded(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  try {
    const stats = statSync(filePath);
    if (stats.size < MAX_LOG_FILE_SIZE_BYTES) {
      return;
    }

    writeFileSync(filePath, '', 'utf-8');
  } catch {
    // Logging must never interrupt the main flow.
  }
}

export function appendStructuredLog(
  filePath: string,
  level: 'log' | 'warn' | 'error',
  scope: string,
  message: string,
  metadata?: Record<string, unknown>,
): void {
  try {
    ensureParentDir(filePath);
    rotateIfNeeded(filePath);

    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      scope,
      message,
      metadata,
    });

    appendFileSync(filePath, `${line}\n`, 'utf-8');
  } catch {
    // Logging must never interrupt the main flow.
  }
}
