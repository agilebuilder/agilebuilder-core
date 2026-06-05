import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

function getErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export async function readJsonFile<T>(filePath: string, initialValue: T): Promise<T> {
  try {
    const content = await readFile(filePath, 'utf8');
    if (!content.trim()) {
      throw new Error(`JSON file is empty: ${filePath}`);
    }
    return JSON.parse(content) as T;
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') {
      return initialValue;
    }
    throw error;
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}
