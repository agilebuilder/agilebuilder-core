import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import { join } from 'node:path';
import { AppError } from '../errors/app-error.js';
import { printError } from '../output/format.js';
import { ClientApi } from '../client/client-api.js';
import { LicenseStore } from '../license/license-store.js';
import { TokenStore } from '../auth/token-store.js';
import { withIsolatedDataDir } from '../test-helpers/data-dir.js';
import {
  cloudDoc,
  cloudTemplate,
  cloudTemplateListItem,
  licenseWithPlan,
} from '../test-helpers/api-mocks.js';
import { createResCommand } from './res.js';

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: unknown;
}

async function runResCommand(args: string[], dataDir: string): Promise<RunResult> {
  const previousDataDir = process.env.AGILEBUILDER_CORE1_DATA_DIR;
  process.env.AGILEBUILDER_CORE1_DATA_DIR = dataDir;

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = ((...messages: unknown[]) => stdoutLines.push(messages.map(String).join(' '))) as typeof console.log;
  console.error = ((...messages: unknown[]) => stderrLines.push(messages.map(String).join(' '))) as typeof console.error;

  try {
    const command = createResCommand();
    command.exitOverride();
    await command.parseAsync(['node', 'ag', ...args]);
    return { stdout: stdoutLines.join('').trim(), stderr: stderrLines.join('').trim(), exitCode: 0 };
  } catch (error) {
    const isJson = args.includes('--json');
    printError(error, { json: isJson });
    const exitCode = error instanceof AppError
      ? error.exitCode
      : ((error as { exitCode?: number }).exitCode ?? 1);
    return {
      stdout: stdoutLines.join('').trim(),
      stderr: stderrLines.join('').trim(),
      exitCode,
      error,
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    if (previousDataDir === undefined) {
      delete process.env.AGILEBUILDER_CORE1_DATA_DIR;
    } else {
      process.env.AGILEBUILDER_CORE1_DATA_DIR = previousDataDir;
    }
  }
}

const originalGetOrRefresh = LicenseStore.getOrRefresh;
const originalGetValidToken = TokenStore.getValidToken;
const originalCreateResource = ClientApi.createResource;
const originalUpdateResource = ClientApi.updateResource;
const originalDeleteResource = ClientApi.deleteResource;
const originalSearchResources = ClientApi.searchResources;
const originalGetResourceDetail = ClientApi.getResourceDetail;

function restoreMocks(): void {
  LicenseStore.getOrRefresh = originalGetOrRefresh;
  TokenStore.getValidToken = originalGetValidToken;
  ClientApi.createResource = originalCreateResource;
  ClientApi.updateResource = originalUpdateResource;
  ClientApi.deleteResource = originalDeleteResource;
  ClientApi.searchResources = originalSearchResources;
  ClientApi.getResourceDetail = originalGetResourceDetail;
}

function mockProLogin(): void {
  TokenStore.getValidToken = async () => 'token';
  LicenseStore.getOrRefresh = async () => licenseWithPlan('pro', ['space-1']);
}

function mockTrialLogin(): void {
  TokenStore.getValidToken = async () => 'token';
  LicenseStore.getOrRefresh = async () => licenseWithPlan('trial', ['space-1']);
}

function mockFreeLogin(spaceId = 'space-free'): void {
  TokenStore.getValidToken = async () => 'token';
  LicenseStore.getOrRefresh = async () => licenseWithPlan('free', [spaceId]);
}

function writeCurrentSpace(dataDir: string, spaceId: string): Promise<void> {
  return writeFile(
    join(dataDir, 'current-space.json'),
    JSON.stringify({ id: spaceId, selectedAt: new Date().toISOString() }),
    'utf8',
  );
}

test.afterEach(restoreMocks);

test('res add template creates a cloud template on pro workspace', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    mockProLogin();
    let created: Record<string, unknown> | undefined;
    ClientApi.createResource = async (_token, spaceId, input) => {
      assert.equal(spaceId, 'space-1');
      created = input as unknown as Record<string, unknown>;
      return cloudTemplate('r1', 'space-1', (input as unknown as { gitUrl: string }).gitUrl);
    };

    const result = await runResCommand(
      ['add', 'template', '--space-id', 'space-1', '--name', 'cloud-template', '--git-url', 'https://example.com/repo.git', '--parent-id', 'p1', '--json'],
      dataDir,
    );

    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.id, 'r1');
    assert.equal(created?.type, 'template');
    assert.equal(created?.branch, 'main');
    assert.equal(created?.parentId, 'p1');
  });
});

test('res add template honors custom branch', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    mockProLogin();
    let created: Record<string, unknown> | undefined;
    ClientApi.createResource = async (_token, _spaceId, input) => {
      created = input as unknown as Record<string, unknown>;
      return cloudTemplate('r1', 'space-1', (input as unknown as { gitUrl: string }).gitUrl);
    };

    await runResCommand(
      ['add', 'template', '--space-id', 'space-1', '--name', 'cloud-template', '--git-url', 'https://example.com/repo.git', '--branch', 'develop', '--json'],
      dataDir,
    );

    assert.equal(created?.branch, 'develop');
  });
});

test('res add doc creates a cloud doc on pro workspace', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    mockProLogin();
    let created: Record<string, unknown> | undefined;
    ClientApi.createResource = async (_token, _spaceId, input) => {
      created = input as unknown as Record<string, unknown>;
      return cloudDoc('r2', 'space-1', 'cloud-doc');
    };

    const result = await runResCommand(
      ['add', 'doc', '--space-id', 'space-1', '--name', 'cloud-doc', '--content', 'hello', '--json'],
      dataDir,
    );

    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.type, 'doc');
    assert.equal(created?.content, 'hello');
    assert.equal(created?.format, 'markdown');
  });
});

test('res add template is blocked on free workspace', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    mockFreeLogin('space-1');

    const result = await runResCommand(
      ['add', 'template', '--space-id', 'space-1', '--name', 't', '--git-url', 'https://example.com/t.git', '--json'],
      dataDir,
    );

    assert.equal(result.exitCode, 1);
    const parsed = JSON.parse(result.stderr);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, 'PRO_ACCESS_REQUIRED');
  });
});

test('res add doc is blocked on free workspace', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    mockFreeLogin('space-1');

    const result = await runResCommand(
      ['add', 'doc', '--space-id', 'space-1', '--name', 't', '--content', 'hello', '--json'],
      dataDir,
    );

    assert.equal(result.exitCode, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'PRO_ACCESS_REQUIRED');
  });
});

test('res add is blocked when not logged in', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    TokenStore.getValidToken = async () => null;

    const result = await runResCommand(
      ['add', 'template', '--space-id', 'space-1', '--name', 't', '--git-url', 'https://example.com/t.git', '--json'],
      dataDir,
    );

    assert.equal(result.exitCode, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'AUTH_TOKEN_UNAVAILABLE');
  });
});

test('res add template succeeds on trial workspace', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    mockTrialLogin();
    ClientApi.createResource = async () => cloudTemplate('r1', 'space-1', 'https://example.com/repo.git');

    const result = await runResCommand(
      ['add', 'template', '--space-id', 'space-1', '--name', 't', '--git-url', 'https://example.com/repo.git', '--json'],
      dataDir,
    );

    assert.equal(result.exitCode, 0);
    assert.equal(JSON.parse(result.stdout).data.id, 'r1');
  });
});

test('res list/search/get work for cloud resources', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    await writeCurrentSpace(dataDir, 'space-1');
    mockProLogin();
    ClientApi.searchResources = async (_token, spaceId, options) => {
      assert.equal(spaceId, 'space-1');
      const keyword = options?.keyword;
      if (keyword) {
        assert.equal(keyword, 'repo');
        return { items: [cloudTemplateListItem('r-search', 'space-1')], total: 1, page: 1, pageSize: 100 };
      }
      return { items: [cloudTemplateListItem('r1', 'space-1')], total: 1, page: 1, pageSize: 100 };
    };
    ClientApi.getResourceDetail = async () => cloudTemplate('r1', 'space-1', 'https://example.com/repo.git');

    const list = await runResCommand(['list', '--json'], dataDir);
    assert.equal(JSON.parse(list.stdout).data.total, 1);

    const search = await runResCommand(['search', 'repo', '--type', 'template', '--json'], dataDir);
    const searchOutput = JSON.parse(search.stdout);
    assert.equal(searchOutput.data.total, 1);
    assert.equal(searchOutput.data.items[0].id, 'r-search');

    const get = await runResCommand(['get', 'r1', '--json'], dataDir);
    assert.equal(JSON.parse(get.stdout).data.id, 'r1');
  });
});

test('res list fails when not logged in', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    await writeCurrentSpace(dataDir, 'space-1');
    TokenStore.getValidToken = async () => null;

    const result = await runResCommand(['list', '--json'], dataDir);
    assert.equal(result.exitCode, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'AUTH_TOKEN_UNAVAILABLE');
  });
});

test('res edit updates a cloud resource on pro workspace', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    mockProLogin();
    ClientApi.getResourceDetail = async () => cloudTemplate('r1', 'space-1', 'https://example.com/old.git');
    ClientApi.updateResource = async (_token, spaceId, resourceId, input) => {
      assert.equal(spaceId, 'space-1');
      assert.equal(resourceId, 'r1');
      return { ...cloudTemplate('r1', 'space-1', 'https://example.com/old.git'), ...input };
    };

    const result = await runResCommand(
      ['edit', 'r1', '--space-id', 'space-1', '--git-url', 'https://example.com/new.git', '--json'],
      dataDir,
    );

    assert.equal(result.exitCode, 0);
    assert.equal(JSON.parse(result.stdout).ok, true);
  });
});

test('res edit maps API not found to RESOURCE_NOT_FOUND', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    mockProLogin();
    ClientApi.getResourceDetail = async () => cloudTemplate('r1', 'space-1', 'https://example.com/old.git');
    ClientApi.updateResource = async () => {
      throw new AppError({ code: 'RESOURCE_NOT_FOUND', message: 'Not found', category: 'resource' });
    };

    const result = await runResCommand(
      ['edit', 'r1', '--space-id', 'space-1', '--name', 'new', '--json'],
      dataDir,
    );

    assert.equal(result.exitCode, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'RESOURCE_NOT_FOUND');
  });
});

test('res edit is blocked on free workspace', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    mockFreeLogin('space-free');
    ClientApi.getResourceDetail = async () => cloudTemplate('r1', 'space-free', 'https://example.com/t.git');

    const result = await runResCommand(
      ['edit', 'r1', '--space-id', 'space-free', '--name', 'new', '--json'],
      dataDir,
    );

    assert.equal(result.exitCode, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'PRO_ACCESS_REQUIRED');
  });
});

test('res edit fails when not logged in', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    TokenStore.getValidToken = async () => null;
    ClientApi.getResourceDetail = async () => cloudTemplate('r1', 'space-1', 'https://example.com/t.git');

    const result = await runResCommand(
      ['edit', 'r1', '--space-id', 'space-1', '--name', 'new', '--json'],
      dataDir,
    );

    assert.equal(result.exitCode, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'AUTH_TOKEN_UNAVAILABLE');
  });
});

test('res remove deletes a cloud resource with --yes', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    mockProLogin();
    let deleted = false;
    ClientApi.deleteResource = async (_token, spaceId, resourceId) => {
      assert.equal(spaceId, 'space-1');
      assert.equal(resourceId, 'r1');
      deleted = true;
    };

    const result = await runResCommand(
      ['remove', 'r1', '--space-id', 'space-1', '--yes', '--json'],
      dataDir,
    );

    assert.equal(result.exitCode, 0);
    assert.equal(deleted, true);
    assert.equal(JSON.parse(result.stdout).data.id, 'r1');
  });
});

test('res remove maps API not found to RESOURCE_NOT_FOUND', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    mockProLogin();
    ClientApi.deleteResource = async () => {
      throw new AppError({ code: 'RESOURCE_NOT_FOUND', message: 'Not found', category: 'resource' });
    };

    const result = await runResCommand(
      ['remove', 'r1', '--space-id', 'space-1', '--yes', '--json'],
      dataDir,
    );

    assert.equal(result.exitCode, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'RESOURCE_NOT_FOUND');
  });
});

test('res remove requires confirmation', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    mockProLogin();

    const result = await runResCommand(
      ['remove', 'r1', '--space-id', 'space-1', '--json'],
      dataDir,
    );

    assert.equal(result.exitCode, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'CONFIRMATION_REQUIRED');
  });
});

test('res remove is blocked on free workspace', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    mockFreeLogin('space-free');

    const result = await runResCommand(
      ['remove', 'r1', '--space-id', 'space-free', '--yes', '--json'],
      dataDir,
    );

    assert.equal(result.exitCode, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'PRO_ACCESS_REQUIRED');
  });
});

test('res remove fails when not logged in', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    TokenStore.getValidToken = async () => null;

    const result = await runResCommand(
      ['remove', 'r1', '--space-id', 'space-1', '--yes', '--json'],
      dataDir,
    );

    assert.equal(result.exitCode, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'AUTH_TOKEN_UNAVAILABLE');
  });
});
