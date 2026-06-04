import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { AppError } from '../errors/app-error.js';

export type FilePatternMode = 'all' | 'include' | 'exclude';
export type QuestionType = 'input' | 'number' | 'confirm' | 'list' | 'checkbox' | 'password';

export interface TemplateQuestion {
  name: string;
  type: QuestionType;
  message: string;
  default?: unknown;
  required?: boolean;
  choices?: Array<string | { name: string; value: unknown }>;
}

export interface TemplateConfig {
  version: number;
  name?: string;
  description?: string;
  source?: {
    type?: 'git' | 'editor';
    subdir?: string;
  };
  variables: {
    enabled: boolean;
    filePatterns: {
      mode: FilePatternMode;
      patterns: string[];
    };
    delimiter: string;
    inquirerQuestions: TemplateQuestion[];
  };
  hooks: Record<string, unknown>;
  market?: Record<string, unknown>;
}

const CONFIG_FILE_NAMES = [
  'agilebuilder.config.json',
  'agilebuilder.config.yaml',
  'agilebuilder.yaml',
  'agilebuilder.yml',
];

export interface LoadedTemplateConfig {
  config: TemplateConfig;
  fileName?: string;
}

export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  version: 1,
  variables: {
    enabled: false,
    filePatterns: {
      mode: 'all',
      patterns: ['**/*'],
    },
    delimiter: '%',
    inquirerQuestions: [],
  },
  hooks: {},
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeFilePatternMode(value: unknown): FilePatternMode {
  return value === 'include' || value === 'exclude' || value === 'all' ? value : 'all';
}

function normalizeQuestions(value: unknown): TemplateQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .filter((question) => typeof question.name === 'string' && typeof question.message === 'string')
    .map((question) => ({
      name: question.name as string,
      type: typeof question.type === 'string' ? question.type as QuestionType : 'input',
      message: question.message as string,
      default: question.default,
      required: typeof question.required === 'boolean' ? question.required : undefined,
      choices: Array.isArray(question.choices) ? question.choices as TemplateQuestion['choices'] : undefined,
    }));
}

export function normalizeTemplateConfig(value: unknown): TemplateConfig {
  if (!isObject(value)) {
    return DEFAULT_TEMPLATE_CONFIG;
  }

  const variables = isObject(value.variables) ? value.variables : {};
  const filePatterns = isObject(variables.filePatterns) ? variables.filePatterns : {};

  return {
    version: typeof value.version === 'number' ? value.version : 1,
    name: typeof value.name === 'string' ? value.name : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
    source: isObject(value.source)
      ? {
          type: value.source.type === 'git' || value.source.type === 'editor' ? value.source.type : undefined,
          subdir: typeof value.source.subdir === 'string' ? value.source.subdir : undefined,
        }
      : undefined,
    variables: {
      enabled: typeof variables.enabled === 'boolean' ? variables.enabled : false,
      filePatterns: {
        mode: normalizeFilePatternMode(filePatterns.mode),
        patterns: Array.isArray(filePatterns.patterns)
          ? filePatterns.patterns.filter((item): item is string => typeof item === 'string')
          : ['**/*'],
      },
      delimiter: typeof variables.delimiter === 'string' && variables.delimiter.length > 0
        ? variables.delimiter
        : '%',
      inquirerQuestions: normalizeQuestions(variables.inquirerQuestions),
    },
    hooks: isObject(value.hooks) ? value.hooks : {},
    market: isObject(value.market) ? value.market : undefined,
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadTemplateConfig(rootDir: string): Promise<LoadedTemplateConfig> {
  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = join(rootDir, fileName);
    if (!await exists(filePath)) {
      continue;
    }

    const content = await readFile(filePath, 'utf8');
    try {
      const parsed = fileName.endsWith('.json')
        ? JSON.parse(content)
        : YAML.parse(content);
      return {
        config: normalizeTemplateConfig(parsed),
        fileName,
      };
    } catch (error) {
      throw new AppError({
        code: 'TEMPLATE_CONFIG_INVALID',
        message: `Template config ${fileName} is invalid: ${error instanceof Error ? error.message : String(error)}`,
        category: 'validation',
      });
    }
  }

  return {
    config: DEFAULT_TEMPLATE_CONFIG,
  };
}
