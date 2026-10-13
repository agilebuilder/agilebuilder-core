import type {
  CloudResourceDetail,
  CloudResourceListItem,
  DeviceInfo,
  DeviceListResponse,
  LicenseResponse,
} from '../client/client-api.js';

export function licenseWithPlan(
  planType: 'free' | 'trial' | 'pro',
  spaceIds: string[] = ['space-1'],
): LicenseResponse {
  return {
    data: {
      license: {
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-01-01T00:00:00.000Z',
        serverTime: '2026-01-01T00:00:00.000Z',
      },
      user: {
        id: 'u1',
        username: 'tester',
        displayName: 'Tester',
        hasPro: planType !== 'free',
      },
      spaces: spaceIds.map((id) => ({
        id,
        name: `Workspace ${id}`,
        type: 'team' as const,
        plan: { type: planType },
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

export function cloudTemplate(
  id: string,
  spaceId: string,
  repo: string,
): CloudResourceDetail {
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

export function cloudDoc(
  id: string,
  spaceId: string,
  name: string,
): CloudResourceDetail {
  const now = new Date(0).toISOString();
  return {
    id,
    spaceId,
    name,
    type: 'doc',
    createdAt: now,
    updatedAt: now,
    doc: {
      content: 'hello',
      format: 'markdown',
      wordCount: 1,
    },
  };
}

export function cloudTemplateListItem(
  id: string,
  spaceId: string,
): CloudResourceListItem {
  return {
    id,
    spaceId,
    name: id,
    type: 'template',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

export function deviceListResponse(
  devices: DeviceInfo[],
): DeviceListResponse {
  return {
    devices,
    total: devices.length,
    activeCount: devices.filter((d) => d.status === 'active').length,
  };
}
