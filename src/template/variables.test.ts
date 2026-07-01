import assert from 'node:assert/strict';
import test from 'node:test';
import { promptForMissingVariables, parseVarsJson, parseVarAssignments } from './variables.js';
import type { PromptFunctions } from './variables.js';
import type { TemplateQuestion } from './config.js';

function createFakePrompts(record: Record<string, unknown>): PromptFunctions {
  return {
    input: async ({ message }: { message: string }) => {
      const value = record[message];
      if (value === undefined) {
        throw new Error(`Unexpected input prompt: ${message}`);
      }
      return String(value);
    },
    password: async ({ message }: { message: string }) => {
      const value = record[message];
      if (value === undefined) {
        throw new Error(`Unexpected password prompt: ${message}`);
      }
      return String(value);
    },
    number: async ({ message }: { message: string }) => {
      const value = record[message];
      if (value === undefined) {
        throw new Error(`Unexpected number prompt: ${message}`);
      }
      return Number(value);
    },
    confirm: async ({ message }: { message: string }) => {
      const value = record[message];
      if (value === undefined) {
        throw new Error(`Unexpected confirm prompt: ${message}`);
      }
      return Boolean(value);
    },
    select: async ({ message }: { message: string }) => {
      const value = record[message];
      if (value === undefined) {
        throw new Error(`Unexpected select prompt: ${message}`);
      }
      return value;
    },
    checkbox: async ({ message }: { message: string }) => {
      const value = record[message];
      if (value === undefined) {
        throw new Error(`Unexpected checkbox prompt: ${message}`);
      }
      return Array.isArray(value) ? value : [value];
    },
  };
}

test('promptForMissingVariables returns preset when no questions', async () => {
  const result = await promptForMissingVariables([], { existing: true });
  assert.deepEqual(result, { existing: true });
});

test('promptForMissingVariables skips provided values', async () => {
  const questions: TemplateQuestion[] = [
    { name: 'projectName', type: 'input', message: 'Project name', required: true },
  ];
  const result = await promptForMissingVariables(
    questions,
    { projectName: 'my-app' },
    createFakePrompts({}),
  );
  assert.deepEqual(result, { projectName: 'my-app' });
});

test('promptForMissingVariables skips empty string values to re-prompt', async () => {
  const questions: TemplateQuestion[] = [
    { name: 'projectName', type: 'input', message: 'Project name', required: true },
  ];
  const result = await promptForMissingVariables(
    questions,
    { projectName: '' },
    createFakePrompts({ 'Project name': 'filled' }),
  );
  assert.deepEqual(result, { projectName: 'filled' });
});

test('promptForMissingVariables prompts for missing input with default', async () => {
  const questions: TemplateQuestion[] = [
    { name: 'ownerName', type: 'input', message: 'Owner name', default: 'AgileBuilder' },
  ];
  const result = await promptForMissingVariables(
    questions,
    {},
    createFakePrompts({ 'Owner name': 'Custom Owner' }),
  );
  assert.deepEqual(result, { ownerName: 'Custom Owner' });
});

test('promptForMissingVariables prompts for missing password', async () => {
  const questions: TemplateQuestion[] = [
    { name: 'apiKey', type: 'password', message: 'API key', required: true },
  ];
  const result = await promptForMissingVariables(
    questions,
    {},
    createFakePrompts({ 'API key': 'secret' }),
  );
  assert.deepEqual(result, { apiKey: 'secret' });
});

test('promptForMissingVariables prompts for missing number with default', async () => {
  const questions: TemplateQuestion[] = [
    { name: 'port', type: 'number', message: 'Port', default: 3000 },
  ];
  const result = await promptForMissingVariables(
    questions,
    {},
    createFakePrompts({ Port: 8080 }),
  );
  assert.deepEqual(result, { port: 8080 });
});

test('promptForMissingVariables prompts for missing confirm with default', async () => {
  const questions: TemplateQuestion[] = [
    { name: 'includeDocker', type: 'confirm', message: 'Include Docker', default: false },
  ];
  const result = await promptForMissingVariables(
    questions,
    {},
    createFakePrompts({ 'Include Docker': true }),
  );
  assert.deepEqual(result, { includeDocker: true });
});

test('promptForMissingVariables prompts for list with choices', async () => {
  const questions: TemplateQuestion[] = [
    {
      name: 'license',
      type: 'list',
      message: 'License',
      choices: ['MIT', 'Apache-2.0'],
    },
  ];
  const result = await promptForMissingVariables(
    questions,
    {},
    createFakePrompts({ License: 'MIT' }),
  );
  assert.deepEqual(result, { license: 'MIT' });
});

test('promptForMissingVariables prompts for checkbox with choices', async () => {
  const questions: TemplateQuestion[] = [
    {
      name: 'features',
      type: 'checkbox',
      message: 'Features',
      choices: ['auth', 'api', 'docs'],
    },
  ];
  const result = await promptForMissingVariables(
    questions,
    {},
    createFakePrompts({ Features: ['auth', 'docs'] }),
  );
  assert.deepEqual(result, { features: ['auth', 'docs'] });
});

test('promptForMissingVariables prompts for multiple missing variables', async () => {
  const questions: TemplateQuestion[] = [
    { name: 'projectName', type: 'input', message: 'Project name', required: true },
    { name: 'ownerName', type: 'input', message: 'Owner name', default: 'AgileBuilder' },
  ];
  const result = await promptForMissingVariables(
    questions,
    {},
    createFakePrompts({
      'Project name': 'demo-app',
      'Owner name': 'Team',
    }),
  );
  assert.deepEqual(result, { projectName: 'demo-app', ownerName: 'Team' });
});

test('parseVarsJson returns empty object for null or undefined', () => {
  assert.deepEqual(parseVarsJson(null), {});
  assert.deepEqual(parseVarsJson(undefined), {});
});

test('parseVarsJson returns object as-is', () => {
  const value = { projectName: 'demo', count: 42, enabled: true };
  assert.deepEqual(parseVarsJson(value), value);
});

test('parseVarsJson throws TEMPLATE_VARS_INVALID for arrays', () => {
  assert.throws(
    () => parseVarsJson([]),
    (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_VARS_INVALID',
  );
});

test('parseVarsJson throws TEMPLATE_VARS_INVALID for non-object values', () => {
  assert.throws(
    () => parseVarsJson('string'),
    (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_VARS_INVALID',
  );
  assert.throws(
    () => parseVarsJson(123),
    (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_VARS_INVALID',
  );
});

test('parseVarAssignments parses scalar values', () => {
  assert.deepEqual(parseVarAssignments(['flag=true', 'disabled=false', 'empty=null', 'count=42', 'pi=3.14', 'negative=-7', 'name=demo']), {
    flag: true,
    disabled: false,
    empty: null,
    count: 42,
    pi: 3.14,
    negative: -7,
    name: 'demo',
  });
});

test('parseVarAssignments keeps literal string for non-scalar values', () => {
  assert.deepEqual(parseVarAssignments(['value=hello world', 'mixed=123abc']), {
    value: 'hello world',
    mixed: '123abc',
  });
});

test('parseVarAssignments handles empty value', () => {
  assert.deepEqual(parseVarAssignments(['key=']), { key: '' });
});

test('parseVarAssignments throws TEMPLATE_VAR_INVALID for missing equals', () => {
  assert.throws(
    () => parseVarAssignments(['noequals']),
    (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_VAR_INVALID',
  );
});

test('parseVarAssignments throws TEMPLATE_VAR_INVALID for empty key', () => {
  assert.throws(
    () => parseVarAssignments(['=value']),
    (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_VAR_INVALID',
  );
});

test('parseVarAssignments returns empty object for undefined input', () => {
  assert.deepEqual(parseVarAssignments(undefined), {});
});

test('parseVarAssignments handles multiple assignments', () => {
  assert.deepEqual(parseVarAssignments(['a=1', 'b=2', 'c=true']), { a: 1, b: 2, c: true });
});
