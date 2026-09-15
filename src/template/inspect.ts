import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { simpleGit } from 'simple-git';
import { loadTemplateConfig } from './config.js';
import { resolveTemplateRoot } from './engine.js';
import type { TemplateVariableInfo } from '../resources/types.js';

export interface InspectTemplateVariablesInput {
  gitUrl: string;
  branch?: string;
  subdir?: string;
}

export async function inspectTemplateVariables(
  input: InspectTemplateVariablesInput,
): Promise<TemplateVariableInfo[]> {
  const tempDir = join(tmpdir(), `agilebuilder-core1-inspect-${randomUUID()}`);
  try {
    const cloneArgs = ['--depth', '1'];
    if (input.branch) {
      cloneArgs.push('--branch', input.branch);
    }
    await simpleGit().clone(input.gitUrl, tempDir, cloneArgs);
    const rootDir = resolveTemplateRoot(tempDir, input.subdir);
    const loaded = await loadTemplateConfig(rootDir);
    return loaded.config.variables.inquirerQuestions.map((question) => ({
      name: question.name,
      type: question.type,
      message: question.message,
      required: question.required === true,
      default: question.default,
      choices: question.choices,
    }));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
