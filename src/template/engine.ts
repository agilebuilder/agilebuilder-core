import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import ejs from 'ejs';
import { minimatch } from 'minimatch';
import { simpleGit } from 'simple-git';
import { AppError } from '../errors/app-error.js';
import { loadTemplateConfig } from './config.js';
import {
  applyQuestionDefaults,
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
}

export interface GenerateResult {
  success: true;
  targetDir: string;
  filesWritten: string[];
  filesSkipped: string[];
  variables: Record<string, unknown>;
  configFile?: string;
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
  return ejs.render(value, {
    ...variables,
    helpers: createHelpers(),
    ...createHelpers(),
  }, { delimiter });
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

function assertSafeTarget(targetDir: string): void {
  const resolved = resolve(targetDir);
  const forbidden = [
    resolve('/'),
    'C:\\',
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
  ].map((item) => item.toLowerCase());

  if (forbidden.includes(resolved.toLowerCase())) {
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

async function walkFiles(rootDir: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') {
        continue;
      }
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

async function runShell(script: string, cwd: string, env?: Record<string, string>): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(script, {
      cwd,
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`Hook exited with code ${code ?? 'unknown'}.`));
      }
    });
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
    await assertTargetWritable(options.targetDir, options.overwrite);

    try {
      const git = simpleGit();
      const cloneArgs = ['--depth', '1'];
      if (options.branch) {
        cloneArgs.push('--branch', options.branch);
      }
      await git.clone(options.gitUrl, tempDir, cloneArgs);

      const rootDir = join(tempDir, options.subdir || '');
      const warnings: string[] = [];
      const loaded = options.templateConfig
        ? { config: options.templateConfig, fileName: undefined }
        : await loadTemplateConfig(rootDir);
      if (!options.templateConfig && !loaded.fileName) {
        warnings.push('No AgileBuilder template config file found; continuing with default config.');
      }
      const sourceDir = join(rootDir, loaded.config.source?.subdir || '.');
      const variables = applyQuestionDefaults(
        loaded.config.variables.inquirerQuestions,
        options.variables || {},
      );
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
        warnings,
        hooksSkipped,
        hooksExecuted,
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
