import { mkdir, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type IsolatedDataDirCallback<T> = (dataDir: string) => Promise<T>;

/**
 * Create a temporary directory, set it as `AGILEBUILDER_CORE1_DATA_DIR`,
 * run the callback, and clean up afterwards.
 *
 * Restores the previous value of the environment variable.
 */
export async function withIsolatedDataDir<T>(
  callback: IsolatedDataDirCallback<T>,
): Promise<T> {
  const base = await mkdtemp(join(tmpdir(), 'ag-core1-test-'));
  const dataDir = join(base, 'data');
  await mkdir(dataDir, { recursive: true });

  const oldValue = process.env.AGILEBUILDER_CORE1_DATA_DIR;
  process.env.AGILEBUILDER_CORE1_DATA_DIR = dataDir;

  try {
    return await callback(dataDir);
  } finally {
    if (oldValue === undefined) {
      delete process.env.AGILEBUILDER_CORE1_DATA_DIR;
    } else {
      process.env.AGILEBUILDER_CORE1_DATA_DIR = oldValue;
    }
    await rm(base, { recursive: true, force: true });
  }
}

/**
 * Set `AGILEBUILDER_CORE1_DATA_DIR` for a dynamic import of a module that reads
 * paths at import time or via singletons. The caller must clean up the directory.
 */
export function setDataDirEnv(dataDir: string): string | undefined {
  const previous = process.env.AGILEBUILDER_CORE1_DATA_DIR;
  process.env.AGILEBUILDER_CORE1_DATA_DIR = dataDir;
  return previous;
}

export function restoreDataDirEnv(previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env.AGILEBUILDER_CORE1_DATA_DIR;
  } else {
    process.env.AGILEBUILDER_CORE1_DATA_DIR = previous;
  }
}
