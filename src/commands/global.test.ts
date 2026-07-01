import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runCli } from '../test-helpers/run-cli.js';
import { withIsolatedDataDir } from '../test-helpers/data-dir.js';

const require = createRequire(import.meta.url);
const { version: APP_VERSION } = require('../../package.json') as { version: string };

function includes(haystack: string, needle: string): void {
  assert.ok(
    haystack.toLowerCase().includes(needle.toLowerCase()),
    `Expected output to include "${needle}". Got: ${haystack}`,
  );
}

test('ag --version and ag -V output the package version', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const long = await runCli(['--version'], dataDir);
    assert.equal(long.exitCode, 0);
    assert.equal(long.stdout, APP_VERSION);

    const short = await runCli(['-V'], dataDir);
    assert.equal(short.exitCode, 0);
    assert.equal(short.stdout, APP_VERSION);
  });
});

test('ag --version ignores --json and prints the plain version', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const result = await runCli(['--version', '--json'], dataDir);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, APP_VERSION);
    assert.equal(result.stderr, '');
  });
});

test('ag --help prints usage, commands and options', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const result = await runCli(['--help'], dataDir);
    assert.equal(result.exitCode, 0);
    includes(result.stdout, 'Usage:');
    includes(result.stdout, 'Commands:');
    includes(result.stdout, 'Options:');
    includes(result.stdout, 'login');
    includes(result.stdout, 'device');
  });
});

test('ag help prints the top-level help', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const result = await runCli(['help'], dataDir);
    assert.equal(result.exitCode, 0);
    includes(result.stdout, 'Usage:');
    includes(result.stdout, 'Commands:');
  });
});

test('ag <command> --help prints command-specific help', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const result = await runCli(['auth', '--help'], dataDir);
    assert.equal(result.exitCode, 0);
    includes(result.stdout, 'auth');
    includes(result.stdout, 'status');
    includes(result.stdout, 'require-token');
  });
});

test('help output follows the configured language', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const setResult = await runCli(['config', 'set', 'language', 'zh-CN'], dataDir);
    assert.equal(setResult.exitCode, 0);

    const help = await runCli(['--help'], dataDir);
    assert.equal(help.exitCode, 0);
    includes(help.stdout, '显示帮助');
  });
});

test('unknown command exits with code 1 and prints an error', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const result = await runCli(['this-command-does-not-exist'], dataDir);
    assert.equal(result.exitCode, 1);
    includes(result.stderr, 'error');
    includes(result.stderr, 'unknown command');
  });
});

test('unknown command with --json exits with an error', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const result = await runCli(['this-command-does-not-exist', '--json'], dataDir);
    assert.equal(result.exitCode, 1);
    includes(result.stderr, 'unknown command');
  });
});

test('global error wrapper prints text errors for failing commands', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const result = await runCli(['auth', 'require-token'], dataDir);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.length > 0, 'Expected a text error message on stderr');
    includes(result.stderr, 'Token');
  });
});

test('global error wrapper prints JSON errors when --json is used', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const result = await runCli(['auth', 'require-token', '--json'], dataDir);
    assert.equal(result.exitCode, 1);
    includes(result.stderr, '"ok"');
    includes(result.stderr, 'false');
    includes(result.stderr, 'AUTH_TOKEN_UNAVAILABLE');
  });
});
