import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initDatabase, closeDatabase } from '../../../db/index.js';
import { TemplatesDAO } from '../../../db/dao/templates.dao.js';
import { resolveTemplateResourceRef } from './template-resource-resolver.js';
import { TokenStore } from '../../../auth/token-store.js';
import { SpaceManager, LOCAL_SPACE_INFO } from '../../../license/space.js';
import { ResourceApi } from '../../../resource/api.js';

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalLoad = TokenStore.load;
const originalGetValidToken = TokenStore.getValidToken;
const originalGetCurrentSpace = SpaceManager.getCurrentSpace;
const originalGetCurrentSpaceInfo = SpaceManager.getCurrentSpaceInfo;
const originalGetAvailableSpaces = SpaceManager.getAvailableSpaces;
const originalGetClientUserSettings = ResourceApi.getClientUserSettings;
const originalGetResourceDetail = ResourceApi.getResourceDetail;

function setTempHome(): string {
  const tempHome = mkdtempSync(join(tmpdir(), 'agilebuilder-mcp-template-test-'));
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  return tempHome;
}

function restoreEnvironment(): void {
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  TokenStore.load = originalLoad;
  TokenStore.getValidToken = originalGetValidToken;
  SpaceManager.getCurrentSpace = originalGetCurrentSpace;
  SpaceManager.getCurrentSpaceInfo = originalGetCurrentSpaceInfo;
  SpaceManager.getAvailableSpaces = originalGetAvailableSpaces;
  ResourceApi.getClientUserSettings = originalGetClientUserSettings;
  ResourceApi.getResourceDetail = originalGetResourceDetail;
}

test.afterEach(async () => {
  await closeDatabase();
  restoreEnvironment();
});

test('resolveTemplateResourceRef resolves local numeric resource IDs in local context', async () => {
  setTempHome();
  await initDatabase();

  const template = await TemplatesDAO.create({
    name: 'local-template',
    git_url: 'https://example.com/repo.git',
  });

  const resolved = await resolveTemplateResourceRef({
    resourceId: String(template.id),
  });

  assert.deepEqual(resolved, {
    source: 'local',
    spaceId: '__local__',
    resourceId: String(template.id),
  });
});

test('resolveTemplateResourceRef falls back across cloud spaces when enabled', async () => {
  setTempHome();

  TokenStore.load = () => ({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 60_000,
    user: {
      id: 'user-1',
      name: 'Demo User',
    },
  });

  TokenStore.getValidToken = async () => 'access-token';

  SpaceManager.getCurrentSpace = () => ({
    spaceId: 'space-current',
    spaceName: 'Current Space',
    plan: 'pro',
    features: [],
    selectedAt: Date.now(),
  });

  SpaceManager.getCurrentSpaceInfo = () => ({
    id: 'space-current',
    name: 'Current Space',
    type: 'team',
    plan: { type: 'pro', expiresAt: null, trialDaysRemaining: null },
    role: 'owner',
    features: [],
  });

  SpaceManager.getAvailableSpaces = () => [
    LOCAL_SPACE_INFO,
    {
      id: 'space-current',
      name: 'Current Space',
      type: 'team',
      plan: { type: 'pro', expiresAt: null, trialDaysRemaining: null },
      role: 'owner',
      features: [],
    },
    {
      id: 'space-other',
      name: 'Other Space',
      type: 'team',
      plan: { type: 'pro', expiresAt: null, trialDaysRemaining: null },
      role: 'member',
      features: [],
    },
  ];

  ResourceApi.getClientUserSettings = async () => ({
    success: true,
    data: {
      mcp: {
        spaceIsolation: false,
      },
    },
  });

  ResourceApi.getResourceDetail = async (spaceId, resourceId) => {
    if (spaceId === 'space-other' && resourceId === 'res_demo_abc') {
      return {
        success: true,
        data: {
          id: resourceId,
          name: 'cross-space-template',
          type: 'template',
          description: 'Cloud template from another space',
          tags: ['vue'],
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T00:00:00.000Z',
          template: {
            sourceType: 'git',
            usageCount: 3,
            definition: {
              source: {
                type: 'git',
                git: {
                  repo: 'https://example.com/cloud-template.git',
                  branch: 'main',
                },
              },
            },
          },
        } as any,
      };
    }

    return {
      success: false,
      error: 'NOT_FOUND',
      httpStatus: 404,
    };
  };

  const resolved = await resolveTemplateResourceRef({
    resourceId: 'res_demo_abc',
  });

  assert.deepEqual(resolved, {
    source: 'cloud',
    spaceId: 'space-other',
    resourceId: 'res_demo_abc',
    spaceName: undefined,
  });
});
