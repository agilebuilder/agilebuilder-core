import { checkbox, confirm, input, number, password, select } from '@inquirer/prompts';
import { AppError } from '../errors/app-error.js';
import type { TemplateQuestion } from './config.js';

export type PromptFunctions = {
  input: (config: { message: string; default?: string; required?: boolean }) => Promise<string>;
  number: (config: { message: string; default?: number; required?: boolean }) => Promise<number | undefined>;
  confirm: (config: { message: string; default?: boolean }) => Promise<boolean>;
  select: (config: { message: string; choices: unknown[]; default?: unknown }) => Promise<unknown>;
  checkbox: (config: { message: string; choices: unknown[]; required?: boolean }) => Promise<unknown[]>;
  password: (config: { message: string; validate?: (value: string) => boolean | string | Promise<string | boolean> }) => Promise<string>;
};

const defaultPrompts: PromptFunctions = {
  input,
  number,
  confirm,
  select: select as PromptFunctions['select'],
  checkbox: checkbox as PromptFunctions['checkbox'],
  password,
};

export function parseVarsJson(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError({
      code: 'TEMPLATE_VARS_INVALID',
      message: 'Template variables must be a JSON object.',
      category: 'validation',
    });
  }
  return value as Record<string, unknown>;
}

export function parseVarAssignments(assignments: string[] | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const assignment of assignments ?? []) {
    const index = assignment.indexOf('=');
    if (index <= 0) {
      throw new AppError({
        code: 'TEMPLATE_VAR_INVALID',
        message: `Invalid variable assignment: ${assignment}`,
        suggestion: 'Use --var key=value.',
        category: 'validation',
      });
    }
    const key = assignment.slice(0, index);
    const rawValue = assignment.slice(index + 1);
    result[key] = parseScalar(rawValue);
  }
  return result;
}

export function applyQuestionDefaults(
  questions: TemplateQuestion[],
  preset: Record<string, unknown>,
): Record<string, unknown> {
  const variables = { ...preset };
  for (const question of questions) {
    if (variables[question.name] === undefined && question.default !== undefined) {
      variables[question.name] = question.default;
    }
  }
  return variables;
}

export function validateRequiredQuestions(
  questions: TemplateQuestion[],
  variables: Record<string, unknown>,
): void {
  const missing = questions
    .filter((question) => question.required === true)
    .filter((question) => variables[question.name] === undefined || variables[question.name] === '')
    .map((question) => question.name);

  if (missing.length > 0) {
    throw new AppError({
      code: 'TEMPLATE_VARS_MISSING',
      message: `Missing required template variables: ${missing.join(', ')}`,
      suggestion: 'Pass values with --vars or --var key=value, or use --interactive to enter them interactively.',
      category: 'validation',
    });
  }
}

function isValueMissing(value: unknown): boolean {
  return value === undefined || value === '';
}

function toStringDefault(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  return value === undefined ? undefined : String(value);
}

function toNumberDefault(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function toBooleanDefault(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeChoices(choices: TemplateQuestion['choices']): (string | { name: string; value: unknown })[] {
  if (!choices) {
    return [];
  }
  return choices;
}

export async function promptForMissingVariables(
  questions: TemplateQuestion[],
  preset: Record<string, unknown>,
  prompts: PromptFunctions = defaultPrompts,
): Promise<Record<string, unknown>> {
  const variables = { ...preset };

  for (const question of questions) {
    if (!isValueMissing(variables[question.name])) {
      continue;
    }

    switch (question.type) {
      case 'input': {
        variables[question.name] = await prompts.input({
          message: question.message,
          default: toStringDefault(question.default),
          required: question.required,
        });
        break;
      }
      case 'password': {
        variables[question.name] = await prompts.password({
          message: question.message,
          validate: question.required ? (value) => value.length > 0 || 'This field is required.' : undefined,
        });
        break;
      }
      case 'number': {
        variables[question.name] = await prompts.number({
          message: question.message,
          default: toNumberDefault(question.default),
          required: question.required,
        });
        break;
      }
      case 'confirm': {
        variables[question.name] = await prompts.confirm({
          message: question.message,
          default: toBooleanDefault(question.default),
        });
        break;
      }
      case 'list': {
        variables[question.name] = await prompts.select({
          message: question.message,
          choices: normalizeChoices(question.choices),
          default: question.default,
        } as Parameters<typeof prompts.select>[0]);
        break;
      }
      case 'checkbox': {
        variables[question.name] = await prompts.checkbox({
          message: question.message,
          choices: normalizeChoices(question.choices),
          required: question.required,
        });
        break;
      }
      default: {
        variables[question.name] = await prompts.input({
          message: question.message,
          default: toStringDefault(question.default),
          required: question.required,
        });
      }
    }
  }

  return variables;
}

function parseScalar(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}
