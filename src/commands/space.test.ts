import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test, { afterEach } from 'node:test';
import { createSpaceCommand } from './space.js';
import { LicenseStore } from '../license/license-store.js';
import { WorkspaceStore } from '../workspace/store.js';
import { setLocale } from '../i18n/index.js';
import { licenseWithPlan } from '../test-helpers/api-mocks.js';
import { runCli } from '../test-helpers/run-cli.js';
import { withIsolatedDataDir } from '../test-helpers/data-dir.js';
import type { LicenseResponse } from '../client/client-api.js';

process.env.AGILEBUILDER_LANG = 'en-US';

let originalGetOrRefresh: typeof LicenseStore.getOrRefresh;

afterEach(() => {
  if (originalGetOrRefresh) {
    LicenseStore.getOrRefresh = originalGetOrRefresh;
    originalGetOrRefresh = undefined as unknown as typeof LicenseStore.getOrRefresh;
  }
});

function mockLicense(response: LicenseResponse | null): boolean[] {
  const calls: boolean[] = [];
  originalGetOrRefresh = LicenseStore.getOrRefresh;
  LicenseStore.getOrRefresh = async (force = false) => {
    calls.push(force);
    return response;
  };
  return calls;
}

function captureConsole(): { logs: string[]; errors: string[]; restore: () => void } {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
  console.warn = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
  return {
    logs,
    errors,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}


async function parseSpaceCommand(args: string[]): Promise<{ logs: string[]; errors: string[] }> {
  setLocale('en-US');
  const command = createSpaceCommand();
  command.exitOverride();
  const capture = captureConsole();
  // Tests describe the user-visible argv which includes the 'space' prefix;
  // strip it because we invoke the space command directly.
  const argv = args[0] === 'space' ? args.slice(1) : args;
  try {
    await command.parseAsync(['node', 'ag', ...argv]);
  } finally {
    capture.restore();
  }
  return { logs: capture.logs, errors: capture.errors };
}

test('space list shows only local workspace when no license is cached', async () => {
  await withIsolatedDataDir(async () => {
    mockLicense(null);
    const { logs } = await parseSpaceCommand(['space', 'list', '--json']);
    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.currentWorkspaceId, 'local');
    assert.equal(parsed.data.items.length, 1);
    assert.equal(parsed.data.items[0].id, 'local');
    assert.equal(parsed.data.items[0].current, true);
  });
});

test('space list shows cached cloud spaces and marks current', async () => {
  await withIsolatedDataDir(async () => {
    mockLicense(licenseWithPlan('pro', ['space-1', 'space-2']));
    WorkspaceStore.setCurrent('space-1');
    const { logs } = await parseSpaceCommand(['space', 'list', '--json']);
    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.currentWorkspaceId, 'space-1');
    assert.equal(parsed.data.items.length, 3);

    const local = parsed.data.items.find((item: { id: string }) => item.id === 'local');
    const s1 = parsed.data.items.find((item: { id: string }) => item.id === 'space-1');
    const s2 = parsed.data.items.find((item: { id: string }) => item.id === 'space-2');
    assert.ok(local);
    assert.equal(local.current, false);
    assert.ok(s1);
    assert.equal(s1.current, true);
    assert.ok(s2);
    assert.equal(s2.current, false);
  });
});

test('space list --refresh forces license refresh', async () => {
  await withIsolatedDataDir(async () => {
    const calls = mockLicense(licenseWithPlan('trial', ['space-1']));
    const { logs } = await parseSpaceCommand(['space', 'list', '--refresh', '--json']);
    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.ok, true);
    assert.deepEqual(calls, [true]);
  });
});

test('space list --refresh without token returns AUTH_TOKEN_UNAVAILABLE', async () => {
  const base = await mkdtemp(join(tmpdir(), 'ag-core1-space-refresh-cli-'));
  const dataDir = join(base, 'data');
  await mkdir(dataDir, { recursive: true });
  try {
    const { stderr, exitCode } = await runCli(['space', 'list', '--refresh', '--json'], dataDir);
    assert.notEqual(exitCode, 0);
    const parsed = JSON.parse(stderr);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, 'AUTH_TOKEN_UNAVAILABLE');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('space current defaults to local workspace', async () => {
  await withIsolatedDataDir(async () => {
    mockLicense(null);
    const { logs } = await parseSpaceCommand(['space', 'current', '--json']);
    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.id, 'local');
    assert.equal(parsed.data.current, true);
    assert.ok(parsed.data.selectedAt);
  });
});

test('space current shows cloud workspace after switch', async () => {
  await withIsolatedDataDir(async () => {
    mockLicense(licenseWithPlan('pro', ['space-1']));
    WorkspaceStore.setCurrent('space-1');
    const { logs } = await parseSpaceCommand(['space', 'current', '--json']);
    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.id, 'space-1');
    assert.equal(parsed.data.name, 'Workspace space-1');
    assert.equal(parsed.data.current, true);
  });
});

test('space current falls back to local when current id is not in license', async () => {
  await withIsolatedDataDir(async () => {
    mockLicense(licenseWithPlan('pro', ['space-1']));
    WorkspaceStore.setCurrent('space-unknown');
    const { logs } = await parseSpaceCommand(['space', 'current', '--json']);
    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.id, 'local');
    assert.equal(parsed.data.current, true);
  });
});

test('space use local switches to local workspace', async () => {
  await withIsolatedDataDir(async () => {
    mockLicense(licenseWithPlan('pro', ['space-1']));
    WorkspaceStore.setCurrent('space-1');
    const { logs } = await parseSpaceCommand(['space', 'use', 'local', '--json']);
    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.workspace.id, 'local');
    assert.equal(WorkspaceStore.getCurrent().id, 'local');
  });
});

test('space use <id> switches to cloud workspace', async () => {
  await withIsolatedDataDir(async () => {
    mockLicense(licenseWithPlan('pro', ['space-1']));
    const { logs } = await parseSpaceCommand(['space', 'use', 'space-1', '--json']);
    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.workspace.id, 'space-1');
    assert.equal(WorkspaceStore.getCurrent().id, 'space-1');
  });
});

test('space use unknown workspace throws WORKSPACE_NOT_FOUND', async () => {
  await withIsolatedDataDir(async () => {
    mockLicense(licenseWithPlan('pro', ['space-1']));
    await assert.rejects(
      () => parseSpaceCommand(['space', 'use', 'space-unknown', '--json']),
      (err: Error) => {
        assert.match(err.message, /Workspace not found: space-unknown/);
        return true;
      },
    );
  });
});

test('space use unknown workspace --json returns structured error via CLI', async () => {
  const base = await mkdtemp(join(tmpdir(), 'ag-core1-space-cli-'));
  const dataDir = join(base, 'data');
  await mkdir(dataDir, { recursive: true });
  try {
    const cache = {
      fetchedAt: Date.now(),
      response: licenseWithPlan('pro', ['space-1']),
    };
    await writeFile(join(dataDir, 'license-cache.json'), JSON.stringify(cache, null, 2), 'utf8');

    const { stderr, exitCode } = await runCli(['space', 'use', 'space-unknown', '--json'], dataDir);
    assert.notEqual(exitCode, 0);
    const parsed = JSON.parse(stderr);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, 'WORKSPACE_NOT_FOUND');
    assert.match(parsed.error.message, /Workspace not found: space-unknown/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
