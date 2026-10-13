import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { runCli } from '../test-helpers/run-cli.js';

process.env.AGILEBUILDER_LANG = 'en-US';

async function makeDataDir(): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), 'ag-core1-config-cmd-'));
  return join(base, 'data');
}

async function cleanup(dataDir: string): Promise<void> {
  await rm(join(dataDir, '..'), { recursive: true, force: true });
}

test('config list shows default values', async () => {
  const dataDir = await makeDataDir();
  try {
    const { stdout, exitCode } = await runCli(['config', 'list'], dataDir);
    assert.equal(exitCode, 0);
    assert.match(stdout, /Current configuration:/);
    assert.match(stdout, /backend\.profile:\s*auto/);
    assert.match(stdout, /language:\s*auto/);
    assert.match(stdout, /template\.allowHooksDefault:\s*false/);
  } finally {
    await cleanup(dataDir);
  }
});

test('config list --json returns default configuration', async () => {
  const dataDir = await makeDataDir();
  try {
    const { stdout, exitCode } = await runCli(['config', 'list', '--json'], dataDir);
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.data, {
      backend: { profile: 'auto' },
      language: 'auto',
      template: { allowHooksDefault: false },
    });
  } finally {
    await cleanup(dataDir);
  }
});

test('config list falls back to defaults when config file is corrupt', async () => {
  const dataDir = await makeDataDir();
  try {
    await runCli(['config', 'set', 'language', 'zh-CN'], dataDir);
    const configPath = join(dataDir, 'config.json');
    const fs = await import('node:fs/promises');
    await fs.writeFile(configPath, '{ not json', 'utf8');

    const { stdout, stderr, exitCode } = await runCli(['config', 'list'], dataDir);
    assert.equal(exitCode, 0);
    assert.match(stdout, /language:\s*auto/);
    assert.match(stderr, /Failed to load configuration/);
  } finally {
    await cleanup(dataDir);
  }
});

test('config get returns known key value', async () => {
  const dataDir = await makeDataDir();
  try {
    const { stdout, exitCode } = await runCli(['config', 'get', 'backend.profile', '--json'], dataDir);
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.data, { key: 'backend.profile', value: 'auto' });
  } finally {
    await cleanup(dataDir);
  }
});

test('config get rejects empty key', async () => {
  const dataDir = await makeDataDir();
  try {
    const { stderr, exitCode } = await runCli(['config', 'get', '', '--json'], dataDir);
    assert.notEqual(exitCode, 0);
    const parsed = JSON.parse(stderr);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, 'CONFIG_KEY_REQUIRED');
  } finally {
    await cleanup(dataDir);
  }
});

test('config get --json rejects unknown key', async () => {
  const dataDir = await makeDataDir();
  try {
    const { stderr, exitCode } = await runCli(['config', 'get', 'unknown.key', '--json'], dataDir);
    assert.notEqual(exitCode, 0);
    const parsed = JSON.parse(stderr);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, 'UNEXPECTED_ERROR');
    assert.match(parsed.error.message, /Unknown config key/);
  } finally {
    await cleanup(dataDir);
  }
});

test('config set backend.profile persists value', async () => {
  const dataDir = await makeDataDir();
  try {
    const { stdout, exitCode } = await runCli(['config', 'set', 'backend.profile', 'china', '--json'], dataDir);
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.config.backend.profile, 'china');

    const getResult = await runCli(['config', 'get', 'backend.profile', '--json'], dataDir);
    assert.equal(getResult.exitCode, 0);
    assert.equal(JSON.parse(getResult.stdout).data.value, 'china');
  } finally {
    await cleanup(dataDir);
  }
});

test('config set language persists value and changes locale', async () => {
  const dataDir = await makeDataDir();
  try {
    const { stdout, exitCode } = await runCli(['config', 'set', 'language', 'zh-CN', '--json'], dataDir);
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.config.language, 'zh-CN');

    const listResult = await runCli(['config', 'list'], dataDir);
    assert.equal(listResult.exitCode, 0);
    assert.match(listResult.stdout, /当前配置：/);
  } finally {
    await cleanup(dataDir);
  }
});

test('config set template.allowHooksDefault persists boolean value', async () => {
  const dataDir = await makeDataDir();
  try {
    const { stdout, exitCode } = await runCli(['config', 'set', 'template.allowHooksDefault', 'true', '--json'], dataDir);
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.config.template.allowHooksDefault, true);

    const getResult = await runCli(['config', 'get', 'template.allowHooksDefault', '--json'], dataDir);
    assert.equal(getResult.exitCode, 0);
    assert.equal(JSON.parse(getResult.stdout).data.value, true);
  } finally {
    await cleanup(dataDir);
  }
});

test('config set --json rejects invalid backend.profile', async () => {
  const dataDir = await makeDataDir();
  try {
    const { stderr, exitCode } = await runCli(['config', 'set', 'backend.profile', 'invalid', '--json'], dataDir);
    assert.notEqual(exitCode, 0);
    const parsed = JSON.parse(stderr);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error.message, /Invalid backend\.profile/);
  } finally {
    await cleanup(dataDir);
  }
});

test('config set --json rejects invalid language', async () => {
  const dataDir = await makeDataDir();
  try {
    const { stderr, exitCode } = await runCli(['config', 'set', 'language', 'klingon', '--json'], dataDir);
    assert.notEqual(exitCode, 0);
    const parsed = JSON.parse(stderr);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, 'INVALID_LANGUAGE');
  } finally {
    await cleanup(dataDir);
  }
});

test('config set --json rejects invalid template.allowHooksDefault', async () => {
  const dataDir = await makeDataDir();
  try {
    const { stderr, exitCode } = await runCli(['config', 'set', 'template.allowHooksDefault', 'maybe', '--json'], dataDir);
    assert.notEqual(exitCode, 0);
    const parsed = JSON.parse(stderr);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error.message, /Invalid template\.allowHooksDefault/);
  } finally {
    await cleanup(dataDir);
  }
});
