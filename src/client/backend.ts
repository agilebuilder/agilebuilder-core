import { ConfigStore } from '../config/store.js';

export type ResolvedBackendProfile = 'china' | 'global';

export interface BackendEndpoints {
  websiteUrl: string;
  ssoWebUrl: string;
  ssoApiUrl: string;
  workspaceUrl: string;
}

const CHINA_TIMEZONES = new Set([
  'asia/shanghai',
  'asia/chongqing',
  'asia/harbin',
  'asia/urumqi',
]);

const DEFAULT_ENDPOINTS: Record<ResolvedBackendProfile, BackendEndpoints> = {
  china: {
    websiteUrl: 'https://www.agilebuilder.cn',
    ssoWebUrl: 'https://api-auth.agilebuilder.cn',
    ssoApiUrl: 'https://api-auth.agilebuilder.cn',
    workspaceUrl: 'https://api-app.agilebuilder.cn',
  },
  global: {
    websiteUrl: 'https://www.agilebuilder.net',
    ssoWebUrl: 'https://api-auth.agilebuilder.net',
    ssoApiUrl: 'https://api-auth.agilebuilder.net',
    workspaceUrl: 'https://api-app.agilebuilder.net',
  },
};

function getDefaultEndpoints(profile: ResolvedBackendProfile): BackendEndpoints {
  return DEFAULT_ENDPOINTS[profile];
}

function detectProfile(): ResolvedBackendProfile {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale?.toLowerCase();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone?.toLowerCase();
  if (locale?.startsWith('zh-cn') || CHINA_TIMEZONES.has(timezone || '')) {
    return 'china';
  }
  return 'global';
}

export function getResolvedBackendProfile(): ResolvedBackendProfile {
  const configured = ConfigStore.load().backend.profile;
  return configured === 'auto' ? detectProfile() : configured;
}

export function getBackendEndpoints(): BackendEndpoints {
  return getDefaultEndpoints(getResolvedBackendProfile());
}
