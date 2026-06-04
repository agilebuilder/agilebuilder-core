import { ConfigStore } from '../config/store.js';

export type ResolvedBackendProfile = 'china' | 'global';

export interface BackendEndpoints {
  ssoUrl: string;
  workspaceUrl: string;
}

const ENDPOINTS: Record<ResolvedBackendProfile, BackendEndpoints> = {
  china: {
    ssoUrl: process.env.AGILEBUILDER_SSO_URL || 'https://sso.agilebuilder.cn',
    workspaceUrl: process.env.AGILEBUILDER_WORKSPACE_URL || 'https://api.agilebuilder.cn',
  },
  global: {
    ssoUrl: process.env.AGILEBUILDER_SSO_URL || 'https://sso.agilebuilder.net',
    workspaceUrl: process.env.AGILEBUILDER_WORKSPACE_URL || 'https://api.agilebuilder.net',
  },
};

function detectProfile(): ResolvedBackendProfile {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale?.toLowerCase();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone?.toLowerCase();
  if (locale?.startsWith('zh-cn') || timezone === 'asia/shanghai') {
    return 'china';
  }
  return 'global';
}

export function getResolvedBackendProfile(): ResolvedBackendProfile {
  const configured = ConfigStore.load().backend.profile;
  return configured === 'auto' ? detectProfile() : configured;
}

export function getBackendEndpoints(): BackendEndpoints {
  return ENDPOINTS[getResolvedBackendProfile()];
}
