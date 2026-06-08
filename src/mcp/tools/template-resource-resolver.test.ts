import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../../errors/app-error.js';
import { LicenseStore } from '../../license/license-store.js';
import { CloudResourceRepository } from '../../resources/cloud-repository.js';
import { ClientApi } from '../../client/client-api.js';
import { resolveTemplateResourceRef } from './template-resource-resolver.js';
import type { LicenseResponse, CloudResourceDetail, ClientUserSettings } from '../../client/client-api.js';
import type { MCPContext } from '../context.js';

const originalCloudGet = CloudResourceRepository.prototype.get;
const originalGetClientUserSettings = ClientApi.getClientUserSettings;
const originalGetOrRefresh = LicenseStore.getOrRefresh;

const context: MCPContext = {
  spaceId: 'space-current',
  spaceName: 'Current',
  spaceType: 'team',
  plan: 'pro',
  isLoggedIn: true,
  isLocalSpace: false,
  accessToken: 'token',
  features: [],
};

function cloudTemplate(id: string, spaceId: string, repo: string): CloudResourceDetail {
  const now = new Date(0).toISOString();
  return {
    id,
    spaceId,
    name: id,
    type: 'template',
    createdAt: now,
    updatedAt: now,
    template: {
      gitRepo: repo,
      gitBranch: 'main',
    },
  };
}

function notFound(resourceId: string): AppError {
  return new AppError({
    code: 'RESOURCE_NOT_FOUND',
    message: `Resource ${resourceId} not found.`,
    category: 'resource',
  });
}

function licenseWithSpaces(...ids: string[]): LicenseResponse {
  return {
    data: {
      license: {
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-01-01T00:00:00.000Z',
        serverTime: '2026-01-01T00:00:00.000Z',
      },
      user: {
        id: 'user',
        username: 'user',
        displayName: 'User',
        hasPro: true,
      },
      spaces: ids.map((id) => ({
        id,
        name: id,
        type: 'team' as const,
        plan: { type: 'pro' as const },
        role: 'owner' as const,
        features: [],
      })),
    },
    signature: {
      payload: '',
      sign: '',
      algorithm: 'RS256',
      timestamp: 0,
    },
  };
}

function restore(): void {
  CloudResourceRepository.prototype.get = originalCloudGet;
  ClientApi.getClientUserSettings = originalGetClientUserSettings;
  LicenseStore.getOrRefresh = originalGetOrRefresh;
}

test.afterEach(restore);

test('resolveTemplateResourceRef uses current cloud space before reading mcp settings', async () => {
  let settingsCalls = 0;
  CloudResourceRepository.prototype.get = async (spaceId: string, resourceId: string) => (
    cloudTemplate(resourceId, spaceId, 'https://example.com/current.git')
  );
  ClientApi.getClientUserSettings = async (): Promise<ClientUserSettings> => {
    settingsCalls++;
    return { mcp: { spaceIsolation: true } };
  };

  const resolved = await resolveTemplateResourceRef(context, 'res_template_1');

  assert.equal(resolved.spaceId, 'space-current');
  assert.equal(resolved.gitUrl, 'https://example.com/current.git');
  assert.equal(settingsCalls, 0);
});

test('resolveTemplateResourceRef blocks cross-space lookup when mcp.spaceIsolation is true', async () => {
  CloudResourceRepository.prototype.get = async () => {
    throw notFound('res_template_1');
  };
  ClientApi.getClientUserSettings = async () => ({ mcp: { spaceIsolation: true } });

  await assert.rejects(
    () => resolveTemplateResourceRef(context, 'res_template_1'),
    (error) => error instanceof AppError && error.code === 'CLOUD_RESOURCE_CROSS_SPACE_DISABLED',
  );
});

test('resolveTemplateResourceRef blocks cross-space lookup when mcp.spaceIsolation is missing', async () => {
  CloudResourceRepository.prototype.get = async () => {
    throw notFound('res_template_1');
  };
  ClientApi.getClientUserSettings = async () => ({});

  await assert.rejects(
    () => resolveTemplateResourceRef(context, 'res_template_1'),
    (error) => error instanceof AppError && error.code === 'CLOUD_RESOURCE_CROSS_SPACE_DISABLED',
  );
});

test('resolveTemplateResourceRef searches accessible spaces only when mcp.spaceIsolation is false', async () => {
  const calls: string[] = [];
  CloudResourceRepository.prototype.get = async (spaceId: string, resourceId: string) => {
    calls.push(spaceId);
    if (spaceId === 'space-other') {
      return cloudTemplate(resourceId, spaceId, 'https://example.com/other.git');
    }
    throw notFound(resourceId);
  };
  ClientApi.getClientUserSettings = async () => ({ mcp: { spaceIsolation: false } });
  LicenseStore.getOrRefresh = async () => licenseWithSpaces('space-current', 'space-other');

  const resolved = await resolveTemplateResourceRef(context, 'res_template_1');

  assert.equal(resolved.spaceId, 'space-other');
  assert.equal(resolved.gitUrl, 'https://example.com/other.git');
  assert.deepEqual(calls, ['space-current', 'space-other']);
});

test('resolveTemplateResourceRef fails closed when reading cloud mcp settings fails', async () => {
  CloudResourceRepository.prototype.get = async () => {
    throw notFound('res_template_1');
  };
  ClientApi.getClientUserSettings = async () => {
    throw new AppError({ code: 'HTTP_500', message: 'settings failed', category: 'network' });
  };

  await assert.rejects(
    () => resolveTemplateResourceRef(context, 'res_template_1'),
    (error) => error instanceof AppError && error.code === 'HTTP_500',
  );
});

test('resolveTemplateResourceRef does not treat current-space network errors as not found', async () => {
  let settingsCalls = 0;
  CloudResourceRepository.prototype.get = async () => {
    throw new AppError({ code: 'HTTP_500', message: 'network failed', category: 'network' });
  };
  ClientApi.getClientUserSettings = async () => {
    settingsCalls++;
    return { mcp: { spaceIsolation: false } };
  };

  await assert.rejects(
    () => resolveTemplateResourceRef(context, 'res_template_1'),
    (error) => error instanceof AppError && error.code === 'HTTP_500',
  );
  assert.equal(settingsCalls, 0);
});
