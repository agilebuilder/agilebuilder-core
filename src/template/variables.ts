import { AppError } from '../errors/app-error.js';
import type { TemplateQuestion } from './config.js';

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
      suggestion: 'Pass values with --vars or --var key=value, or use --interactive later when interactive collection is implemented.',
      category: 'validation',
    });
  }
}

function parseScalar(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}
