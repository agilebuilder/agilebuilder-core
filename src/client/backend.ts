import { ConfigStore } from '../config/store.js';

export type ResolvedBackendProfile = 'china' | 'global';

export interface BackendEndpoints {
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

function getDefaultEndpoints(profile: ResolvedBackendProfile): BackendEndpoints {
  const explicit = getExplicitEndpoints(profile);
  if (explicit) {
    return explicit;
  }

  if (profile === 'china') {
    return {
      ssoWebUrl: 'https://api-auth.agilebuilder.cn',
      ssoApiUrl: 'https://api-auth.agilebuilder.cn',
      workspaceUrl: 'https://api-app.agilebuilder.cn',
    };
  }
  return {
    ssoWebUrl: 'https://api-auth.agilebuilder.net',
    ssoApiUrl: 'https://api-auth.agilebuilder.net',
    workspaceUrl: 'https://api-app.agilebuilder.net',
  };
}

function getExplicitEndpoints(profile: ResolvedBackendProfile): BackendEndpoints | null {
  const genericNames = [
    'AGILEBUILDER_SSO_WEB_URL',
    'AGILEBUILDER_SSO_API_URL',
    'AGILEBUILDER_WORKSPACE_URL',
  ] as const;
  const genericValues = genericNames.map((name) => process.env[name]?.trim());
  if (genericValues.some(Boolean)) {
    assertAllConfigured(genericNames, genericValues);
    return {
      ssoWebUrl: genericValues[0]!,
      ssoApiUrl: genericValues[1]!,
      workspaceUrl: genericValues[2]!,
    };
  }

  const profileNames = profile === 'china'
    ? ['AG_BACKEND_CHINA_SSO_WEB_URL', 'AG_BACKEND_CHINA_SSO_URL', 'AG_BACKEND_CHINA_WORKSPACE_URL'] as const
    : ['AG_BACKEND_GLOBAL_SSO_WEB_URL', 'AG_BACKEND_GLOBAL_SSO_URL', 'AG_BACKEND_GLOBAL_WORKSPACE_URL'] as const;
  const profileValues = profileNames.map((name) => process.env[name]?.trim());
  if (profileValues.some(Boolean)) {
    assertAllConfigured(profileNames, profileValues);
    return {
      ssoWebUrl: profileValues[0]!,
      ssoApiUrl: profileValues[1]!,
      workspaceUrl: profileValues[2]!,
    };
  }

  return null;
}

function assertAllConfigured(
  names: readonly string[],
  values: Array<string | undefined>,
): void {
  const missing = names.filter((_, index) => !values[index]);
  if (missing.length > 0) {
    throw new Error(`Incomplete backend configuration. Missing: ${missing.join(', ')}`);
  }
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
