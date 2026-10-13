import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../errors/app-error.js';
import { LicenseStore } from '../license/license-store.js';
import { TokenStore } from '../auth/token-store.js';
import { CloudResourceRepository } from './cloud-repository.js';
import { ClientApi } from '../client/client-api.js';
import type { LicenseResponse } from '../client/client-api.js';
import {
  cloudDoc,
  cloudTemplate,
  cloudTemplateListItem,
  licenseWithPlan as apiLicenseWithPlan,
} from '../test-helpers/api-mocks.js';

const originalGetOrRefresh = LicenseStore.getOrRefresh;
const originalGetValidToken = TokenStore.getValidToken;
const originalCreateResource = ClientApi.createResource;
const originalUpdateResource = ClientApi.updateResource;
const originalDeleteResource = ClientApi.deleteResource;
const originalSearchResources = ClientApi.searchResources;
const originalGetResourceDetail = ClientApi.getResourceDetail;

function licenseWithPlan(planType: 'free' | 'trial' | 'pro'): LicenseResponse {
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
        hasPro: planType !== 'free',
      },
      spaces: [
        {
          id: 'space-1',
          name: 'Workspace',
          type: 'team',
          plan: { type: planType },
          role: 'owner',
          features: [],
        },
      ],
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
  LicenseStore.getOrRefresh = originalGetOrRefresh;
  TokenStore.getValidToken = originalGetValidToken;
  ClientApi.createResource = originalCreateResource;
  ClientApi.updateResource = originalUpdateResource;
  ClientApi.deleteResource = originalDeleteResource;
  ClientApi.searchResources = originalSearchResources;
  ClientApi.getResourceDetail = originalGetResourceDetail;
}

test.afterEach(restore);

test('CloudResourceRepository.addTemplate blocks free workspaces', async () => {
  LicenseStore.getOrRefresh = async () => licenseWithPlan('free');
  TokenStore.getValidToken = async () => 'token';
  ClientApi.createResource = async () => ({ id: 'r1' } as any);

  const repo = new CloudResourceRepository();
  await assert.rejects(
    () => repo.addTemplate('space-1', { name: 'Template', gitUrl: 'https://example.com/t.git' }),
    (error) => error instanceof AppError && error.code === 'PRO_ACCESS_REQUIRED',
  );
});

test('CloudResourceRepository.addTemplate allows pro workspaces', async () => {
  LicenseStore.getOrRefresh = async () => licenseWithPlan('pro');
  TokenStore.getValidToken = async () => 'token';
  let called = false;
  ClientApi.createResource = async () => {
    called = true;
    return { id: 'r1' } as any;
  };

  const repo = new CloudResourceRepository();
  await repo.addTemplate('space-1', { name: 'Template', gitUrl: 'https://example.com/t.git' });
  assert.equal(called, true);
});

test('CloudResourceRepository.addTemplate allows free workspaces when user has Pro', async () => {
  const multiSpaceLicense = licenseWithPlan('free');
  multiSpaceLicense.data.user.hasPro = true;
  LicenseStore.getOrRefresh = async () => multiSpaceLicense;
  TokenStore.getValidToken = async () => 'token';
  let called = false;
  ClientApi.createResource = async () => {
    called = true;
    return { id: 'r1' } as any;
  };

  const repo = new CloudResourceRepository();
  await repo.addTemplate('space-1', { name: 'Template', gitUrl: 'https://example.com/t.git' });
  assert.equal(called, true);
});

test('CloudResourceRepository.addTemplate allows trial workspaces', async () => {
  LicenseStore.getOrRefresh = async () => licenseWithPlan('trial');
  TokenStore.getValidToken = async () => 'token';
  let called = false;
  ClientApi.createResource = async () => {
    called = true;
    return { id: 'r1' } as any;
  };

  const repo = new CloudResourceRepository();
  await repo.addTemplate('space-1', { name: 'Template', gitUrl: 'https://example.com/t.git' });
  assert.equal(called, true);
});

test('CloudResourceRepository.addTemplate requires token', async () => {
  LicenseStore.getOrRefresh = async () => apiLicenseWithPlan('pro');
  TokenStore.getValidToken = async () => null;
  ClientApi.createResource = async () => ({ id: 'r1' } as any);

  const repo = new CloudResourceRepository();
  await assert.rejects(
    () => repo.addTemplate('space-1', { name: 'Template', gitUrl: 'https://example.com/t.git' }),
    (error) => error instanceof AppError && error.code === 'AUTH_TOKEN_UNAVAILABLE',
  );
});

test('CloudResourceRepository.addDoc blocks free workspaces', async () => {
  LicenseStore.getOrRefresh = async () => licenseWithPlan('free');
  TokenStore.getValidToken = async () => 'token';
  ClientApi.createResource = async () => ({ id: 'd1' } as any);

  const repo = new CloudResourceRepository();
  await assert.rejects(
    () => repo.addDoc('space-1', { name: 'Doc', uri: 'local-doc://doc', content: 'hello' }),
    (error) => error instanceof AppError && error.code === 'PRO_ACCESS_REQUIRED',
  );
});

test('CloudResourceRepository.addDoc allows pro workspaces', async () => {
  LicenseStore.getOrRefresh = async () => licenseWithPlan('pro');
  TokenStore.getValidToken = async () => 'token';
  let called = false;
  ClientApi.createResource = async () => {
    called = true;
    return cloudDoc('d1', 'space-1', 'Doc');
  };

  const repo = new CloudResourceRepository();
  const result = await repo.addDoc('space-1', { name: 'Doc', uri: 'local-doc://doc', content: 'hello' });
  assert.equal(called, true);
  assert.equal(result.type, 'doc');
});

test('CloudResourceRepository.addDoc allows trial workspaces', async () => {
  LicenseStore.getOrRefresh = async () => licenseWithPlan('trial');
  TokenStore.getValidToken = async () => 'token';
  let called = false;
  ClientApi.createResource = async () => {
    called = true;
    return cloudDoc('d1', 'space-1', 'Doc');
  };

  const repo = new CloudResourceRepository();
  await repo.addDoc('space-1', { name: 'Doc', uri: 'local-doc://doc', content: 'hello' });
  assert.equal(called, true);
});

test('CloudResourceRepository.addDoc requires token', async () => {
  LicenseStore.getOrRefresh = async () => apiLicenseWithPlan('pro');
  TokenStore.getValidToken = async () => null;
  ClientApi.createResource = async () => ({ id: 'd1' } as any);

  const repo = new CloudResourceRepository();
  await assert.rejects(
    () => repo.addDoc('space-1', { name: 'Doc', uri: 'local-doc://doc', content: 'hello' }),
    (error) => error instanceof AppError && error.code === 'AUTH_TOKEN_UNAVAILABLE',
  );
});

test('CloudResourceRepository.update blocks free workspaces', async () => {
  LicenseStore.getOrRefresh = async () => licenseWithPlan('free');
  TokenStore.getValidToken = async () => 'token';
  ClientApi.updateResource = async () => ({ id: 'r1' } as any);

  const repo = new CloudResourceRepository();
  await assert.rejects(
    () => repo.update('space-1', 'r1', { name: 'Updated' }),
    (error) => error instanceof AppError && error.code === 'PRO_ACCESS_REQUIRED',
  );
});

test('CloudResourceRepository.update allows pro workspaces', async () => {
  LicenseStore.getOrRefresh = async () => licenseWithPlan('pro');
  TokenStore.getValidToken = async () => 'token';
  ClientApi.updateResource = async () => cloudTemplate('r1', 'space-1', 'https://example.com/t.git');

  const repo = new CloudResourceRepository();
  const result = await repo.update('space-1', 'r1', { name: 'Updated' });
  assert.equal(result.type, 'template');
});

test('CloudResourceRepository.update allows trial workspaces', async () => {
  LicenseStore.getOrRefresh = async () => licenseWithPlan('trial');
  TokenStore.getValidToken = async () => 'token';
  ClientApi.updateResource = async () => cloudTemplate('r1', 'space-1', 'https://example.com/t.git');

  const repo = new CloudResourceRepository();
  const result = await repo.update('space-1', 'r1', { name: 'Updated' });
  assert.equal(result.type, 'template');
});

test('CloudResourceRepository.update requires token', async () => {
  LicenseStore.getOrRefresh = async () => apiLicenseWithPlan('pro');
  TokenStore.getValidToken = async () => null;
  ClientApi.updateResource = async () => ({ id: 'r1' } as any);

  const repo = new CloudResourceRepository();
  await assert.rejects(
    () => repo.update('space-1', 'r1', { name: 'Updated' }),
    (error) => error instanceof AppError && error.code === 'AUTH_TOKEN_UNAVAILABLE',
  );
});

test('CloudResourceRepository.remove blocks free workspaces', async () => {
  LicenseStore.getOrRefresh = async () => licenseWithPlan('free');
  TokenStore.getValidToken = async () => 'token';
  ClientApi.deleteResource = async () => undefined;

  const repo = new CloudResourceRepository();
  await assert.rejects(
    () => repo.remove('space-1', 'r1'),
    (error) => error instanceof AppError && error.code === 'PRO_ACCESS_REQUIRED',
  );
});

test('CloudResourceRepository.remove allows pro workspaces', async () => {
  LicenseStore.getOrRefresh = async () => licenseWithPlan('pro');
  TokenStore.getValidToken = async () => 'token';
  let called = false;
  ClientApi.deleteResource = async () => {
    called = true;
  };

  const repo = new CloudResourceRepository();
  await repo.remove('space-1', 'r1');
  assert.equal(called, true);
});

test('CloudResourceRepository.remove allows trial workspaces', async () => {
  LicenseStore.getOrRefresh = async () => licenseWithPlan('trial');
  TokenStore.getValidToken = async () => 'token';
  let called = false;
  ClientApi.deleteResource = async () => {
    called = true;
  };

  const repo = new CloudResourceRepository();
  await repo.remove('space-1', 'r1');
  assert.equal(called, true);
});

test('CloudResourceRepository.remove requires token', async () => {
  LicenseStore.getOrRefresh = async () => apiLicenseWithPlan('pro');
  TokenStore.getValidToken = async () => null;
  ClientApi.deleteResource = async () => undefined;

  const repo = new CloudResourceRepository();
  await assert.rejects(
    () => repo.remove('space-1', 'r1'),
    (error) => error instanceof AppError && error.code === 'AUTH_TOKEN_UNAVAILABLE',
  );
});

test('CloudResourceRepository.list returns search results', async () => {
  TokenStore.getValidToken = async () => 'token';
  ClientApi.searchResources = async () => ({
    items: [cloudTemplateListItem('r1', 'space-1')],
    total: 1,
    page: 1,
    pageSize: 100,
  });

  const repo = new CloudResourceRepository();
  const result = await repo.list({ spaceId: 'space-1' });
  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.id, 'r1');
});

test('CloudResourceRepository.list requires token', async () => {
  TokenStore.getValidToken = async () => null;
  ClientApi.searchResources = async () => ({ items: [], total: 0, page: 1, pageSize: 100 });

  const repo = new CloudResourceRepository();
  await assert.rejects(
    () => repo.list({ spaceId: 'space-1' }),
    (error) => error instanceof AppError && error.code === 'AUTH_TOKEN_UNAVAILABLE',
  );
});

test('CloudResourceRepository.search passes keyword and type', async () => {
  TokenStore.getValidToken = async () => 'token';
  let receivedSpaceId = '';
  let receivedOptions: { type?: string; keyword?: string; page?: number; pageSize?: number } = {};
  ClientApi.searchResources = async (token, spaceId, options) => {
    receivedSpaceId = spaceId;
    receivedOptions = options ?? {};
    return { items: [], total: 0, page: 1, pageSize: 100 };
  };

  const repo = new CloudResourceRepository();
  await repo.list({ spaceId: 'space-1', type: 'template', keyword: 'react' });
  assert.equal(receivedSpaceId, 'space-1');
  assert.equal(receivedOptions.type, 'template');
  assert.equal(receivedOptions.keyword, 'react');
  assert.equal(receivedOptions.pageSize, 100);
});

test('CloudResourceRepository.get returns resource detail', async () => {
  TokenStore.getValidToken = async () => 'token';
  ClientApi.getResourceDetail = async () => cloudTemplate('r1', 'space-1', 'https://example.com/t.git');

  const repo = new CloudResourceRepository();
  const result = await repo.get('space-1', 'r1');
  assert.equal(result.id, 'r1');
  assert.equal(result.type, 'template');
});

test('CloudResourceRepository.get requires token', async () => {
  TokenStore.getValidToken = async () => null;
  ClientApi.getResourceDetail = async () => cloudTemplate('r1', 'space-1', 'https://example.com/t.git');

  const repo = new CloudResourceRepository();
  await assert.rejects(
    () => repo.get('space-1', 'r1'),
    (error) => error instanceof AppError && error.code === 'AUTH_TOKEN_UNAVAILABLE',
  );
});
