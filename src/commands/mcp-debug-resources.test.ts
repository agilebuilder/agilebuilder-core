import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createMcpDebugResourcesCommand } from './mcp-debug-resources.js';
import { withIsolatedDataDir } from '../test-helpers/data-dir.js';
import { licenseWithPlan, cloudTemplateListItem } from '../test-helpers/api-mocks.js';
import { LocalResourceRepository } from '../resources/local-repository.js';
import { CloudResourceRepository } from '../resources/cloud-repository.js';
import { LicenseStore } from '../license/license-store.js';
import { TokenStore } from '../auth/token-store.js';
import type { CloudResourceListResponse } from '../client/client-api.js';

const originalLicenseGetOrRefresh = LicenseStore.getOrRefresh;
const originalTokenGetValidToken = TokenStore.getValidToken;
const originalCloudList = CloudResourceRepository.prototype.list;

function restoreMocks(): void {
  LicenseStore.getOrRefresh = originalLicenseGetOrRefresh;
  TokenStore.getValidToken = originalTokenGetValidToken;
  CloudResourceRepository.prototype.list = originalCloudList;
}

test.afterEach(restoreMocks);

async function setCurrentSpace(dataDir: string, spaceId: string): Promise<void> {
  await writeFile(
    join(dataDir, 'current-space.json'),
    JSON.stringify({ id: spaceId, selectedAt: new Date().toISOString() }, null, 2),
    'utf8',
  );
}

async function runCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const command = createMcpDebugResourcesCommand();
  command.exitOverride();

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...items: unknown[]) => stdoutLines.push(items.join(' '));
  console.error = (...items: unknown[]) => stderrLines.push(items.join(' '));

  try {
    await command.parseAsync(['node', 'script', ...args]);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  return { stdout: stdoutLines.join('\n'), stderr: stderrLines.join('\n') };
}

test('mcp-debug-resources shows local templates in local space', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const seedRepo = new LocalResourceRepository();
    await seedRepo.addTemplate({ name: 'Local Template', gitUrl: 'https://example.com/local.git' });

    const { stdout } = await runCommand(['--json']);
    const report = JSON.parse(stdout);

    assert.equal(report.context.isLocalSpace, true);
    assert.equal(report.context.currentSpaceId, 'local');
    assert.equal(report.mode, 'current-space');
    assert.equal(report.templates.length, 1);
    assert.equal(report.templates[0].name, 'Local Template');
    assert.equal(report.templates[0].source, 'local');
    assert.equal(report.warnings.length, 0);
  });
});

test('mcp-debug-resources shows cloud templates for current space', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    await setCurrentSpace(dataDir, 'space-current');

    TokenStore.getValidToken = async () => 'token';
    LicenseStore.getOrRefresh = async () => licenseWithPlan('pro', ['space-current']);
    CloudResourceRepository.prototype.list = async (input): Promise<CloudResourceListResponse> => {
      if (input.spaceId === 'space-current' && input.type === 'template') {
        return {
          items: [cloudTemplateListItem('res_1', 'space-current')],
          total: 1,
          page: 1,
          pageSize: 100,
        };
      }
      return { items: [], total: 0, page: 1, pageSize: 100 };
    };

    const { stdout } = await runCommand(['--json']);
    const report = JSON.parse(stdout);

    assert.equal(report.context.isLocalSpace, false);
    assert.equal(report.context.currentSpaceId, 'space-current');
    assert.equal(report.context.isLoggedIn, true);
    assert.equal(report.mode, 'current-space');
    assert.equal(report.templates.length, 1);
    assert.equal(report.templates[0].id, 'res_1');
    assert.equal(report.templates[0].source, 'cloud');
    assert.equal(report.templates[0].spaceId, 'space-current');
  });
});

test('mcp-debug-resources --all-spaces scans other spaces and collects failures as warnings', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    await setCurrentSpace(dataDir, 'space-current');

    TokenStore.getValidToken = async () => 'token';
    LicenseStore.getOrRefresh = async () => licenseWithPlan('pro', ['space-current', 'space-other']);
    CloudResourceRepository.prototype.list = async (input): Promise<CloudResourceListResponse> => {
      if (input.spaceId === 'space-current') {
        return {
          items: [cloudTemplateListItem('current_1', 'space-current')],
          total: 1,
          page: 1,
          pageSize: 100,
        };
      }
      if (input.spaceId === 'space-other') {
        throw new Error('Network unreachable');
      }
      return { items: [], total: 0, page: 1, pageSize: 100 };
    };

    const { stdout } = await runCommand(['--all-spaces', '--json']);
    const report = JSON.parse(stdout);

    assert.equal(report.mode, 'all-spaces');
    assert.equal(report.templates.length, 1);
    assert.equal(report.templates[0].id, 'current_1');
    assert.equal(report.warnings.length, 1);
    assert.match(report.warnings[0], /space-other/);
    assert.match(report.warnings[0], /Network unreachable/);
  });
});

test('mcp-debug-resources --all-spaces scans all accessible spaces when current is cloud', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    await setCurrentSpace(dataDir, 'space-current');

    TokenStore.getValidToken = async () => 'token';
    LicenseStore.getOrRefresh = async () => licenseWithPlan('pro', ['space-current', 'space-other']);
    CloudResourceRepository.prototype.list = async (input): Promise<CloudResourceListResponse> => {
      if (input.spaceId === 'space-current' && input.type === 'template') {
        return {
          items: [cloudTemplateListItem('current_1', 'space-current')],
          total: 1,
          page: 1,
          pageSize: 100,
        };
      }
      if (input.spaceId === 'space-other' && input.type === 'template') {
        return {
          items: [cloudTemplateListItem('other_1', 'space-other')],
          total: 1,
          page: 1,
          pageSize: 100,
        };
      }
      return { items: [], total: 0, page: 1, pageSize: 100 };
    };

    const { stdout } = await runCommand(['--all-spaces', '--json']);
    const report = JSON.parse(stdout);

    assert.equal(report.templates.length, 2);
    const ids = report.templates.map((t: { id: string }) => t.id).sort();
    assert.deepEqual(ids, ['current_1', 'other_1']);
    assert.equal(report.warnings.length, 0);
  });
});

test('mcp-debug-resources text output includes report sections', async () => {
  await withIsolatedDataDir(async () => {
    const seedRepo = new LocalResourceRepository();
    await seedRepo.addTemplate({ name: 'Text Template', gitUrl: 'https://example.com/text.git' });

    const { stdout } = await runCommand([]);

    assert.match(stdout, /MCP Debug Resources/);
    assert.match(stdout, /Mode: current-space/);
    assert.match(stdout, /Text Template/);
    assert.match(stdout, /MCP Resources/);
  });
});

test('mcp-debug-resources --all-spaces skips other spaces when not logged in', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    await setCurrentSpace(dataDir, 'space-current');

    TokenStore.getValidToken = async () => null;
    LicenseStore.getOrRefresh = async () => licenseWithPlan('pro', ['space-current', 'space-other']);
    CloudResourceRepository.prototype.list = async (): Promise<CloudResourceListResponse> => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
    });

    const { stdout } = await runCommand(['--all-spaces', '--json']);
    const report = JSON.parse(stdout);

    assert.equal(report.context.isLoggedIn, false);
    assert.equal(report.context.isLocalSpace, false);
    assert.equal(report.templates.length, 0);
    assert.equal(report.warnings.length, 0);
  });
});
