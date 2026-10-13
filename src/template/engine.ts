import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import ejs from 'ejs';
import { minimatch } from 'minimatch';
import { simpleGit } from 'simple-git';
import { AppError } from '../errors/app-error.js';
import { t } from '../i18n/index.js';
import { loadTemplateConfig } from './config.js';
import {
  applyQuestionDefaults,
  promptForMissingVariables,
  validateRequiredQuestions,
} from './variables.js';
import type { TemplateConfig } from './config.js';

export interface GenerateFromGitOptions {
  gitUrl: string;
  branch?: string;
  subdir?: string;
  targetDir: string;
  variables?: Record<string, unknown>;
  templateConfig?: TemplateConfig;
  overwrite?: boolean;
  keepGit?: boolean;
  allowHooks?: boolean;
  interactive?: boolean;
}

export interface GenerateResult {
  success: true;
  targetDir: string;
  filesWritten: string[];
  filesSkipped: string[];
  variables: Record<string, unknown>;
  configFile?: string;
  templateCommit?: string;
  warnings?: string[];
  hooksSkipped?: string[];
  hooksExecuted?: string[];
}

function createHelpers(): Record<string, (value: string) => string> {
  return {
    camelCase: (value) => value.replace(/[-_\s]+(.)?/g, (_, char: string | undefined) => char ? char.toUpperCase() : '').replace(/^./, (char) => char.toLowerCase()),
    pascalCase: (value) => value.replace(/[-_\s]+(.)?/g, (_, char: string | undefined) => char ? char.toUpperCase() : '').replace(/^./, (char) => char.toUpperCase()),
    kebabCase: (value) => value.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase(),
    snakeCase: (value) => value.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_').toLowerCase(),
    uppercase: (value) => value.toUpperCase(),
    lowercase: (value) => value.toLowerCase(),
  };
}

function isBinaryBuffer(buffer: Buffer): boolean {
  const length = Math.min(buffer.length, 8000);
  for (let i = 0; i < length; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}

function shouldCompile(filePath: string, config: TemplateConfig): boolean {
  if (!config.variables.enabled) {
    return false;
  }
  const patterns = config.variables.filePatterns.patterns.length > 0
    ? config.variables.filePatterns.patterns
    : ['**/*'];
  const normalized = filePath.replace(/\\/g, '/');
  switch (config.variables.filePatterns.mode) {
    case 'include':
      return patterns.some((pattern) => minimatch(normalized, pattern, { dot: true }));
    case 'exclude':
      return !patterns.some((pattern) => minimatch(normalized, pattern, { dot: true }));
    case 'all':
    default:
      return true;
  }
}

function renderTemplate(value: string, variables: Record<string, unknown>, delimiter: string): string {
  try {
    return ejs.render(value, {
      ...variables,
      helpers: createHelpers(),
      ...createHelpers(),
    }, { delimiter });
  } catch (error) {
    if (error instanceof ReferenceError) {
      const match = error.message.match(/(\w+) is not defined/);
      const name = match?.[1];
      throw new AppError({
        code: 'TEMPLATE_VARS_MISSING',
        message: name
          ? `Missing required template variable: ${name}`
          : 'Missing required template variables.',
        suggestion: 'Pass values with --vars or --var key=value, or use --interactive to enter them interactively.',
        category: 'validation',
      });
    }
    throw error;
  }
}

function renderPathTemplate(value: string, variables: Record<string, unknown>, delimiter: string): string {
  const braceRendered = value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const parts = key.split('.');
    let cursor: unknown = variables;
    for (const part of parts) {
      if (!cursor || typeof cursor !== 'object') {
        return '';
      }
      cursor = (cursor as Record<string, unknown>)[part];
    }
    return cursor === undefined || cursor === null ? '' : String(cursor);
  });

  return braceRendered.includes('<')
    ? renderTemplate(braceRendered, variables, delimiter)
    : braceRendered;
}

function isUnsafeTarget(resolved: string): boolean {
  const lower = resolved.toLowerCase();
  const forbiddenExact = new Set([
    resolve('/').toLowerCase(),
    'C:\\',
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\Program Files\\Git',
  ]);
  if (forbiddenExact.has(lower)) {
    return true;
  }
  const forbiddenPrefixes = [
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\Program Files\\Git',
  ];
  for (const prefix of forbiddenPrefixes) {
    if (lower === prefix.toLowerCase() || lower.startsWith(prefix.toLowerCase() + '\\')) {
      return true;
    }
  }
  // Drive roots (e.g., C:\) and Unix root
  if (/^[a-z]:\\$/.test(lower) || lower === '/' || lower === '//') {
    return true;
  }
  return false;
}

function assertSafeTarget(targetDir: string): void {
  const resolved = resolve(targetDir);
  if (isUnsafeTarget(resolved)) {
    throw new AppError({
      code: 'UNSAFE_TARGET_DIR',
      message: `Refusing to write to unsafe target directory: ${resolved}`,
      category: 'validation',
    });
  }
}

async function assertTargetWritable(targetDir: string, overwrite: boolean | undefined): Promise<void> {
  assertSafeTarget(targetDir);
  if (!existsSync(targetDir)) {
    return;
  }
  const stat = statSync(targetDir);
  if (!stat.isDirectory()) {
    throw new AppError({
      code: 'TARGET_NOT_WRITABLE',
      message: `Target path is not a directory: ${targetDir}`,
      category: 'validation',
    });
  }
  const entries = await readdir(targetDir);
  if (entries.length > 0 && !overwrite) {
    throw new AppError({
      code: 'TARGET_NOT_EMPTY',
      message: `Target directory is not empty: ${targetDir}`,
      suggestion: 'Use --overwrite to allow writing into a non-empty directory.',
      category: 'validation',
    });
  }
}

export function resolveTemplateRoot(tempDir: string, subdir?: string): string {
  const normalizedTemp = resolve(tempDir);
  const rootDir = resolve(normalizedTemp, subdir || '.');
  // Ensure the resolved root stays inside the temp clone directory.
  if (!rootDir.startsWith(normalizedTemp + sep) && rootDir !== normalizedTemp) {
    throw new AppError({
      code: 'TEMPLATE_SUBDIR_UNSAFE',
      message: t('create.subdirUnsafe', { subdir: subdir || '' }),
      suggestion: 'Use a subdirectory path that stays within the template repository.',
      category: 'validation',
    });
  }
  return rootDir;
}

async function resolveHeadCommit(dir: string): Promise<string | undefined> {
  try {
    const hash = (await simpleGit(dir).revparse(['HEAD'])).trim();
    return hash || undefined;
  } catch {
    return undefined;
  }
}

function assertSafeSubdir(rootDir: string, subdir?: string): void {
  if (!subdir) {
    return;
  }
  if (subdir.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(subdir)) {
    throw new AppError({
      code: 'TEMPLATE_SUBDIR_UNSAFE',
      message: t('create.subdirUnsafe', { subdir }),
      suggestion: 'Use a relative subdirectory path that stays within the template repository.',
      category: 'validation',
    });
  }
  const normalized = subdir.replace(/\\/g, '/');
  if (normalized.split('/').some((segment) => segment === '..')) {
    throw new AppError({
      code: 'TEMPLATE_SUBDIR_UNSAFE',
      message: t('create.subdirUnsafe', { subdir }),
      suggestion: 'Use a subdirectory path that stays within the template repository.',
      category: 'validation',
    });
  }
  const resolved = resolve(rootDir, subdir);
  const normalizedRoot = resolve(rootDir);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + sep)) {
    throw new AppError({
      code: 'TEMPLATE_SUBDIR_UNSAFE',
      message: t('create.subdirUnsafe', { subdir }),
      suggestion: 'Use a subdirectory path that stays within the template repository.',
      category: 'validation',
    });
  }
}

async function walkFiles(rootDir: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return result;
}

async function copyTemplateFiles(input: {
  sourceDir: string;
  targetDir: string;
  config: TemplateConfig;
  variables: Record<string, unknown>;
  keepGit?: boolean;
}): Promise<{ filesWritten: string[]; filesSkipped: string[] }> {
  const files = await walkFiles(input.sourceDir);
  const filesWritten: string[] = [];
  const filesSkipped: string[] = [];

  for (const sourceFile of files) {
    const relPath = relative(input.sourceDir, sourceFile).replace(/\\/g, '/');
    if (!input.keepGit && (relPath === '.git' || relPath.startsWith('.git/'))) {
      filesSkipped.push(relPath);
      continue;
    }
    if (relPath === '.agilebuilder.config.yaml' || relPath === '.agilebuilder.config.json') {
      filesSkipped.push(relPath);
      continue;
    }

    const shouldRender = shouldCompile(relPath, input.config);
    const delimiter = input.config.variables.delimiter;
    const renderedRelPath = input.config.variables.enabled
      ? renderPathTemplate(relPath, input.variables, delimiter)
      : relPath;
    const targetFile = join(input.targetDir, renderedRelPath);
    await mkdir(dirname(targetFile), { recursive: true });

    const content = await readFile(sourceFile);
    if (!shouldRender || isBinaryBuffer(content)) {
      await writeFile(targetFile, content);
    } else {
      const rendered = renderTemplate(content.toString('utf8'), input.variables, delimiter);
      await writeFile(targetFile, rendered, 'utf8');
    }
    filesWritten.push(renderedRelPath);
  }

  return { filesWritten, filesSkipped };
}

const DEFAULT_HOOK_TIMEOUT_MS = 5 * 60 * 1000;

function windowsGitBash(env: NodeJS.ProcessEnv): string {
  // Windows' System32 bash is WSL and may not have the host's Node/tools.
  // Locate the shell beside the Git installation already available on PATH.
  for (const directory of (env.PATH || env.Path || '').split(delimiter)) {
    const path = directory.replace(/^"|"$/g, '');
    if (!path || !existsSync(join(path, 'git.exe'))) continue;
    for (const candidate of [join(path, 'bash.exe'), join(dirname(path), 'bin', 'bash.exe')]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return 'bash';
}

async function runShell(
  script: string,
  cwd: string,
  env?: Record<string, string>,
  timeoutMs: number = DEFAULT_HOOK_TIMEOUT_MS,
): Promise<void> {
  const mergedEnv = { ...process.env, ...env };

  await new Promise<void>((resolvePromise, reject) => {
    let tryBashOnWindows = process.platform === 'win32';
    let child: ReturnType<typeof spawn>;
    let stdout = '';
    let stderr = '';
    let timeout: NodeJS.Timeout | undefined;

    const startProcess = (): void => {
      if (tryBashOnWindows) {
        child = spawn(windowsGitBash(mergedEnv), ['-c', script], { cwd, stdio: 'pipe', env: mergedEnv });
      } else {
        child = spawn(script, { cwd, shell: true, stdio: 'pipe', env: mergedEnv });
      }

      child.stdout?.on('data', (chunk) => {
        process.stdout.write(chunk);
        stdout += chunk;
      });
      child.stderr?.on('data', (chunk) => {
        process.stderr.write(chunk);
        stderr += chunk;
      });

      timeout = setTimeout(() => {
        child.kill('SIGTERM');
        // Give the process a short grace period, then force kill.
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000).unref();
        reject(new AppError({
          code: 'HOOK_TIMEOUT',
          message: t('hook.timeout', { timeout: Math.round(timeoutMs / 1000) }),
          category: 'system',
        }));
      }, timeoutMs);

      child.once('error', (err) => {
        if (timeout) clearTimeout(timeout);
        const errno = (err as NodeJS.ErrnoException).code;
        if (tryBashOnWindows && errno === 'ENOENT') {
          // Git Bash is not available; fall back to the system default shell.
          tryBashOnWindows = false;
          startProcess();
          return;
        }
        reject(err);
      });

      child.once('exit', (code) => {
        if (timeout) clearTimeout(timeout);
        if (code === 0) {
          resolvePromise();
        } else {
          const output = (stderr || stdout).trim();
          reject(new Error(`Hook exited with code ${code ?? 'unknown'}.${output ? `\n${output}` : ''}`));
        }
      });
    };

    startProcess();
  });
}

async function executeHooks(input: {
  config: TemplateConfig;
  targetDir: string;
  allowHooks?: boolean;
}): Promise<{ hooksSkipped: string[]; hooksExecuted: string[] }> {
  const hooksSkipped: string[] = [];
  const hooksExecuted: string[] = [];
  const afterWrite = input.config.hooks.after_write;
  if (!afterWrite) {
    return { hooksSkipped, hooksExecuted };
  }

  if (!input.allowHooks) {
    hooksSkipped.push('after_write');
    return { hooksSkipped, hooksExecuted };
  }

  if (afterWrite.scriptType !== 'shell') {
    throw new AppError({
      code: 'HOOK_TYPE_UNSUPPORTED',
      message: `Unsupported hook script type: ${afterWrite.scriptType}`,
      category: 'validation',
    });
  }

  try {
    await runShell(afterWrite.script, input.targetDir, afterWrite.env);
    hooksExecuted.push('after_write');
  } catch (error) {
    if (afterWrite.errorHandling === 'continue' || afterWrite.errorHandling === 'warn') {
      hooksSkipped.push('after_write');
      return { hooksSkipped, hooksExecuted };
    }
    throw new AppError({
      code: 'HOOK_FAILED',
      message: error instanceof Error ? error.message : String(error),
      category: 'system',
    });
  }

  return { hooksSkipped, hooksExecuted };
}

export class TemplateEngine {
  async generateFromGit(options: GenerateFromGitOptions): Promise<GenerateResult> {
    const tempDir = join(tmpdir(), `agilebuilder-core1-${randomUUID()}`);
    assertSafeTarget(options.targetDir);
    await assertTargetWritable(options.targetDir, options.overwrite);

    try {
      const git = simpleGit();
      const cloneArgs = ['--depth', '1'];
      if (options.branch) {
        cloneArgs.push('--branch', options.branch);
      }
      await git.clone(options.gitUrl, tempDir, cloneArgs);
      const templateCommit = await resolveHeadCommit(tempDir);

      const rootDir = resolveTemplateRoot(tempDir, options.subdir);
      const warnings: string[] = [];
      const loaded = options.templateConfig
        ? { config: options.templateConfig, fileName: undefined }
        : await loadTemplateConfig(rootDir);
      if (!options.templateConfig && !loaded.fileName) {
        warnings.push('No AgileBuilder template config file found; continuing with default config.');
      }
      const sourceSubdir = loaded.config.source?.subdir;
      assertSafeSubdir(rootDir, sourceSubdir);
      const sourceDir = sourceSubdir ? resolve(rootDir, sourceSubdir) : rootDir;
      const variables = applyQuestionDefaults(
        loaded.config.variables.inquirerQuestions,
        options.variables || {},
      );
      if (options.interactive && loaded.config.variables.enabled) {
        await promptForMissingVariables(
          loaded.config.variables.inquirerQuestions,
          variables,
        );
      }
      validateRequiredQuestions(loaded.config.variables.inquirerQuestions, variables);

      await mkdir(options.targetDir, { recursive: true });
      const { filesWritten, filesSkipped } = await copyTemplateFiles({
        sourceDir,
        targetDir: options.targetDir,
        config: loaded.config,
        variables,
        keepGit: options.keepGit,
      });
      const { hooksSkipped, hooksExecuted } = await executeHooks({
        config: loaded.config,
        targetDir: options.targetDir,
        allowHooks: options.allowHooks,
      });

      return {
        success: true,
        targetDir: options.targetDir,
        filesWritten,
        filesSkipped,
        variables,
        configFile: loaded.fileName,
        templateCommit,
        warnings,
        hooksSkipped,
        hooksExecuted,
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
