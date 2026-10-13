import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitFixtureFile {
  path: string;
  content: string | Buffer;
}

export async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

/**
 * Initialize a local Git repository under `repoDir`, optionally write files, and commit.
 */
export async function initGitRepo(
  repoDir: string,
  files: GitFixtureFile[] = [],
): Promise<void> {
  await mkdir(repoDir, { recursive: true });
  await git(repoDir, ['init']);
  await git(repoDir, ['config', 'user.email', 'test@example.com']);
  await git(repoDir, ['config', 'user.name', 'Test']);

  for (const file of files) {
    const fullPath = join(repoDir, file.path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.content);
  }

  if (files.length > 0) {
    await git(repoDir, ['add', '.']);
    await git(repoDir, ['commit', '-m', 'initial']);
  }
}
