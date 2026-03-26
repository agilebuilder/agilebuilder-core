export type BackendProfile = 'china' | 'global';
export type BackendProfileSetting = 'auto' | BackendProfile;

export interface BackendEndpoints {
  ssoUrl: string;
  workspaceUrl: string;
}

export const BACKEND_PROFILE_ENDPOINTS: Record<BackendProfile, BackendEndpoints> = {
  china: {
    ssoUrl: 'https://api-auth.agilebuilder.cn',
    workspaceUrl: 'https://api-app.agilebuilder.cn',
  },
  global: {
    ssoUrl: 'https://api-auth.agilebuilder.net',
    workspaceUrl: 'https://api-app.agilebuilder.net',
  },
};
