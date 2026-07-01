import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface RunCliOptions {
  /** Additional environment variables merged into process.env. */
  env?: Record<string, string | undefined>;
  /** Current working directory for the CLI process. Defaults to process.cwd(). */
  cwd?: string;
}

export interface RunCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const isSourceMode = fileURLToPath(import.meta.url).endsWith('.ts');
const CLI_ENTRY = isSourceMode
  ? join(process.cwd(), 'src', 'cli', 'index.ts')
  : join(process.cwd(), 'dist', 'cli', 'index.js');

/**
 * Execute the core1 CLI in a child process with an isolated data dir.
 *
 * When the test suite is run from source (`npm run test:unit`), the CLI is
 * launched via `tsx` so that tests do not depend on a previous build.
 * When run from compiled output (`npm test`), the built CLI is used.
 *
 * The caller is responsible for providing a fresh temporary data directory.
 */
export async function runCli(
  args: string[],
  dataDir: string,
  options: RunCliOptions = {},
): Promise<RunCliResult> {
  const cwd = options.cwd ?? process.cwd();
  const execArgs = isSourceMode
    ? ['--import', 'tsx', CLI_ENTRY, ...args]
    : [CLI_ENTRY, ...args];

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      execArgs,
      {
        cwd,
        env: {
          ...process.env,
          AGILEBUILDER_CORE1_DATA_DIR: dataDir,
          ...(options.env ?? {}),
        },
      },
    );
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (error) {
    const execError = error as {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    return {
      stdout: (execError.stdout ?? '').trim(),
      stderr: (execError.stderr ?? '').trim(),
      exitCode: execError.code ?? 1,
    };
  }
}
