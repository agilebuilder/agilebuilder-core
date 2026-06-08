import { ClientHttp } from './http.js';
import type { UserInfo } from '../auth/types.js';

export interface LicenseResponse {
  data: {
    license: {
      issuedAt: string;
      expiresAt: string;
      serverTime: string;
    };
    user: {
      id: string;
      username: string;
      displayName: string;
      avatar?: string;
      hasPro: boolean;
    };
    spaces: CloudSpace[];
  };
  signature: {
    payload: string;
    sign: string;
    algorithm: string;
    timestamp: number;
  };
}

export interface CloudSpace {
  id: string;
  name: string;
  type: 'personal' | 'team';
  plan: {
    type: 'free' | 'trial' | 'pro';
    expiresAt?: string | null;
    trialDaysRemaining?: number | null;
  };
  role: 'owner' | 'admin' | 'member' | 'viewer';
  features: string[];
}

export interface CloudResourceListItem {
  id: string;
  spaceId: string;
  spaceName?: string;
  name: string;
  type: 'template' | 'pipeline' | 'doc';
  description?: string;
  tags?: string[];
  nodeId?: string;
  path?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CloudResourceListResponse {
  items: CloudResourceListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CloudResourceDetail extends CloudResourceListItem {
  version?: number;
  published?: boolean;
  readme?: string;
  template?: {
    sourceType?: 'git' | 'upload' | 'editor';
    gitRepo?: string;
    gitBranch?: string;
    variablesSchema?: Record<string, unknown>;
    definition?: {
      configSource?: 'workspace' | 'template_files';
      source?: {
        type?: 'git' | 'upload' | 'editor';
        git?: {
          repo?: string;
          branch?: string;
          subfolder?: string;
        };
      };
      variables?: Record<string, unknown>;
      hooks?: Record<string, unknown>;
    };
  };
  doc?: {
    content?: string;
    format?: string;
    wordCount?: number;
  };
}

export interface CreateCloudTemplateInput {
  name: string;
  type: 'template';
  parentId?: string;
  description?: string;
  tags?: string[];
  gitUrl: string;
  branch?: string;
  subdir?: string;
}

export interface CreateCloudDocInput {
  name: string;
  type: 'doc';
  parentId?: string;
  description?: string;
  tags?: string[];
  uri?: string;
  content: string;
  format?: 'markdown' | 'text';
}

export type CreateCloudResourceInput = CreateCloudTemplateInput | CreateCloudDocInput;

export interface UpdateCloudResourceInput {
  name?: string;
  parentId?: string;
  description?: string;
  tags?: string[];
  gitUrl?: string;
  branch?: string;
  subdir?: string;
  uri?: string;
  content?: string;
  format?: 'markdown' | 'text';
}

export interface DeviceInfo {
  id: string;
  deviceId: string;
  deviceType: string;
  deviceName?: string;
  os?: string;
  osVersion?: string;
  clientVersion?: string;
  lastActiveAt?: string;
  status?: string;
  isCurrent?: boolean;
  createdAt?: string;
}

export interface DeviceListResponse {
  devices: DeviceInfo[];
  total: number;
  activeCount: number;
}

export interface ClientUserSettings {
  mcp?: {
    spaceIsolation?: boolean;
  };
}

export class ClientApi {
  static getUserProfile(token: string): Promise<UserInfo> {
    return ClientHttp.get<UserInfo>('/api/client/user/profile', { token });
  }

  static getUserSpaces(token: string): Promise<CloudSpace[]> {
    return ClientHttp.get<CloudSpace[]>('/api/client/user/spaces', { token });
  }

  static getLicense(token: string): Promise<LicenseResponse> {
    return ClientHttp.get<LicenseResponse>('/api/client/license', { token });
  }

  static refreshLicense(token: string): Promise<LicenseResponse> {
    return ClientHttp.post<LicenseResponse>('/api/client/license/refresh', undefined, { token });
  }

  static searchResources(
    token: string,
    spaceId: string,
    options: {
      type?: string;
      keyword?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ): Promise<CloudResourceListResponse> {
    const params = new URLSearchParams();
    if (options.type) params.set('type', options.type);
    if (options.keyword) params.set('keyword', options.keyword);
    if (options.page) params.set('page', String(options.page));
    if (options.pageSize) params.set('pageSize', String(options.pageSize));
    const query = params.toString() ? `?${params.toString()}` : '';
    return ClientHttp.get<CloudResourceListResponse>(`/api/client/spaces/${spaceId}/resources${query}`, { token });
  }

  static getResourceDetail(token: string, spaceId: string, resourceId: string): Promise<CloudResourceDetail> {
    return ClientHttp.get<CloudResourceDetail>(`/api/client/spaces/${spaceId}/resources/${resourceId}`, { token });
  }

  static createResource(token: string, spaceId: string, input: CreateCloudResourceInput): Promise<CloudResourceDetail> {
    return ClientHttp.post<CloudResourceDetail>(`/api/client/spaces/${spaceId}/resources`, input, { token });
  }

  static updateResource(token: string, spaceId: string, resourceId: string, input: UpdateCloudResourceInput): Promise<CloudResourceDetail> {
    return ClientHttp.post<CloudResourceDetail>(`/api/client/spaces/${spaceId}/resources/${resourceId}/update`, input, { token });
  }

  static deleteResource(token: string, spaceId: string, resourceId: string): Promise<unknown> {
    return ClientHttp.post(`/api/client/spaces/${spaceId}/resources/${resourceId}/delete`, undefined, { token });
  }

  static recordResourceAccess(token: string, spaceId: string, resourceId: string): Promise<unknown> {
    return ClientHttp.post(`/api/client/spaces/${spaceId}/resources/${resourceId}/access`, undefined, { token });
  }

  static listDevices(token: string): Promise<DeviceListResponse> {
    return ClientHttp.get<DeviceListResponse>('/api/client/device/list', { token });
  }

  static revokeDevice(token: string, deviceId: string, reason?: string): Promise<unknown> {
    return ClientHttp.post('/api/client/device/revoke', { deviceId, reason }, { token });
  }

  static revokeAllOtherDevices(token: string): Promise<unknown> {
    return ClientHttp.post('/api/client/device/revoke-all', undefined, { token });
  }

  static getClientUserSettings(token: string): Promise<ClientUserSettings> {
    return ClientHttp.get<ClientUserSettings>('/api/client/user/settings', { token });
  }
}
