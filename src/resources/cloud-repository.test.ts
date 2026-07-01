import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../errors/app-error.js';
import { LicenseStore } from '../license/license-store.js';
import { TokenStore } from '../auth/token-store.js';
import { CloudResourceRepository } from './cloud-repository.js';
import { ClientApi } from '../client/client-api.js';
import type { LicenseResponse } from '../client/client-api.js';

const originalGetOrRefresh = LicenseStore.getOrRefresh;
const originalGetValidToken = TokenStore.getValidToken;
const originalCreateResource = ClientApi.createResource;
const originalUpdateResource = ClientApi.updateResource;
const originalDeleteResource = ClientApi.deleteResource;

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
        hasPro: true,
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
