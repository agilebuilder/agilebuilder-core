import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { loadTemplateConfig, normalizeTemplateConfig, DEFAULT_TEMPLATE_CONFIG } from './config.js';

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

test('loadTemplateConfig loads YAML config', async () => {
  const dir = await tempDir('ag-core1-config-yaml-');
  try {
    await writeFile(join(dir, '.agilebuilder.config.yaml'), 'version: "1.0"\nvariables:\n  enabled: true\n', 'utf8');
    const loaded = await loadTemplateConfig(dir);
    assert.equal(loaded.fileName, '.agilebuilder.config.yaml');
    assert.equal(loaded.config.version, '1.0');
    assert.equal(loaded.config.variables.enabled, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadTemplateConfig loads JSON config', async () => {
  const dir = await tempDir('ag-core1-config-json-');
  try {
    await writeFile(join(dir, '.agilebuilder.config.json'), JSON.stringify({ version: '1.0', variables: { enabled: true } }), 'utf8');
    const loaded = await loadTemplateConfig(dir);
    assert.equal(loaded.fileName, '.agilebuilder.config.json');
    assert.equal(loaded.config.version, '1.0');
    assert.equal(loaded.config.variables.enabled, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadTemplateConfig prefers YAML over JSON', async () => {
  const dir = await tempDir('ag-core1-config-priority-');
  try {
    await writeFile(join(dir, '.agilebuilder.config.json'), JSON.stringify({ version: '1.0', variables: { enabled: false } }), 'utf8');
    await writeFile(join(dir, '.agilebuilder.config.yaml'), 'version: "2.0"\nvariables:\n  enabled: true\n', 'utf8');
    const loaded = await loadTemplateConfig(dir);
    assert.equal(loaded.fileName, '.agilebuilder.config.yaml');
    assert.equal(loaded.config.version, '2.0');
    assert.equal(loaded.config.variables.enabled, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadTemplateConfig returns default config when no config file exists', async () => {
  const dir = await tempDir('ag-core1-config-default-');
  try {
    const loaded = await loadTemplateConfig(dir);
    assert.equal(loaded.fileName, undefined);
    assert.deepEqual(loaded.config, DEFAULT_TEMPLATE_CONFIG);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadTemplateConfig throws TEMPLATE_CONFIG_INVALID for invalid YAML', async () => {
  const dir = await tempDir('ag-core1-config-bad-yaml-');
  try {
    await writeFile(join(dir, '.agilebuilder.config.yaml'), 'variables: [', 'utf8');
    await assert.rejects(
      () => loadTemplateConfig(dir),
      (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_CONFIG_INVALID',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadTemplateConfig throws TEMPLATE_CONFIG_INVALID for invalid JSON', async () => {
  const dir = await tempDir('ag-core1-config-bad-json-');
  try {
    await writeFile(join(dir, '.agilebuilder.config.json'), '{ not json', 'utf8');
    await assert.rejects(
      () => loadTemplateConfig(dir),
      (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_CONFIG_INVALID',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('normalizeTemplateConfig returns defaults for non-object input', () => {
  assert.deepEqual(normalizeTemplateConfig(null), DEFAULT_TEMPLATE_CONFIG);
  assert.deepEqual(normalizeTemplateConfig('string'), DEFAULT_TEMPLATE_CONFIG);
  assert.deepEqual(normalizeTemplateConfig(123), DEFAULT_TEMPLATE_CONFIG);
});

test('normalizeTemplateConfig fills default values', () => {
  const config = normalizeTemplateConfig({ version: '1.0' });
  assert.equal(config.version, '1.0');
  assert.equal(config.variables.enabled, false);
  assert.equal(config.variables.filePatterns.mode, 'all');
  assert.deepEqual(config.variables.filePatterns.patterns, ['**/*']);
  assert.equal(config.variables.delimiter, '%');
  assert.deepEqual(config.variables.inquirerQuestions, []);
  assert.deepEqual(config.hooks, {});
  assert.equal(config.name, undefined);
  assert.equal(config.description, undefined);
  assert.equal(config.source, undefined);
});

test('normalizeTemplateConfig normalizes source fields', () => {
  const config = normalizeTemplateConfig({
    source: { type: 'git', subdir: 'template' },
  });
  assert.equal(config.source?.type, 'git');
  assert.equal(config.source?.subdir, 'template');
});

test('normalizeTemplateConfig ignores invalid source type', () => {
  const config = normalizeTemplateConfig({
    source: { type: 'invalid', subdir: 'template' },
  });
  assert.equal(config.source?.type, undefined);
  assert.equal(config.source?.subdir, 'template');
});

test('normalizeTemplateConfig normalizes file pattern mode', () => {
  assert.equal(normalizeTemplateConfig({ variables: { filePatterns: { mode: 'include' } } }).variables.filePatterns.mode, 'include');
  assert.equal(normalizeTemplateConfig({ variables: { filePatterns: { mode: 'exclude' } } }).variables.filePatterns.mode, 'exclude');
  assert.equal(normalizeTemplateConfig({ variables: { filePatterns: { mode: 'all' } } }).variables.filePatterns.mode, 'all');
  assert.equal(normalizeTemplateConfig({ variables: { filePatterns: { mode: 'unknown' } } }).variables.filePatterns.mode, 'all');
});

test('normalizeTemplateConfig normalizes file patterns', () => {
  const config = normalizeTemplateConfig({
    variables: { filePatterns: { patterns: ['**/*.txt', 123, '**/*.md', null] } },
  });
  assert.deepEqual(config.variables.filePatterns.patterns, ['**/*.txt', '**/*.md']);
});

test('normalizeTemplateConfig uses default delimiter when invalid', () => {
  assert.equal(normalizeTemplateConfig({ variables: { delimiter: '' } }).variables.delimiter, '%');
  assert.equal(normalizeTemplateConfig({ variables: { delimiter: 123 } }).variables.delimiter, '%');
});

test('normalizeTemplateConfig normalizes questions with defaults', () => {
  const config = normalizeTemplateConfig({
    variables: {
      inquirerQuestions: [
        { name: 'projectName', message: 'Project name' },
        { name: 'owner', type: 'input', message: 'Owner', default: 'AgileBuilder', required: true },
        { name: 'features', type: 'checkbox', message: 'Features', choices: ['auth', 'docs'] },
        { invalid: true },
      ],
    },
  });
  assert.equal(config.variables.inquirerQuestions.length, 3);
  assert.deepEqual(config.variables.inquirerQuestions[0], {
    name: 'projectName',
    type: 'input',
    message: 'Project name',
    default: undefined,
    required: undefined,
    choices: undefined,
  });
  assert.deepEqual(config.variables.inquirerQuestions[1], {
    name: 'owner',
    type: 'input',
    message: 'Owner',
    default: 'AgileBuilder',
    required: true,
    choices: undefined,
  });
  assert.deepEqual(config.variables.inquirerQuestions[2], {
    name: 'features',
    type: 'checkbox',
    message: 'Features',
    default: undefined,
    required: undefined,
    choices: ['auth', 'docs'],
  });
});

test('normalizeTemplateConfig normalizes hooks', () => {
  const config = normalizeTemplateConfig({
    hooks: {
      after_write: {
        scriptType: 'shell',
        script: 'echo ok',
        errorHandling: 'warn',
        env: { KEY: 'value', IGNORED: 123 },
      },
      invalid_hook: { notScript: true },
    },
  });
  const hook = config.hooks.after_write;
  assert.ok(hook);
  assert.equal(hook.scriptType, 'shell');
  assert.equal(hook.script, 'echo ok');
  assert.equal(hook.errorHandling, 'warn');
  assert.deepEqual(hook.env, { KEY: 'value' });
  assert.equal(config.hooks.invalid_hook, undefined);
});

test('normalizeTemplateConfig fills hook defaults', () => {
  const config = normalizeTemplateConfig({
    hooks: {
      after_write: { script: 'echo ok' },
    },
  });
  const hook = config.hooks.after_write;
  assert.ok(hook);
  assert.equal(hook.scriptType, 'shell');
  assert.equal(hook.errorHandling, 'stop');
  assert.equal(hook.env, undefined);
});

test('normalizeTemplateConfig preserves name, description and market', () => {
  const config = normalizeTemplateConfig({
    name: 'test-template',
    description: 'A test template',
    market: { category: 'test' },
  });
  assert.equal(config.name, 'test-template');
  assert.equal(config.description, 'A test template');
  assert.deepEqual(config.market, { category: 'test' });
});
