import { TokenStore } from '../auth/token-store.js';
import { WorkspaceStore } from '../workspace/store.js';
import { LicenseStore } from '../license/license-store.js';
import { LOCAL_SPACE_ID } from '../shared/constants.js';
import { cloudSpaceToWorkspace, getLocalWorkspace } from '../workspace/store.js';
import type { CloudSpace } from '../client/client-api.js';

export interface MCPContext {
  spaceId: string;
  spaceName: string;
  spaceType: 'local' | 'personal' | 'team';
  plan: string;
  isLoggedIn: boolean;
  isLocalSpace: boolean;
  accessToken: string | null;
  features: string[];
}

export async function getMCPContext(): Promise<MCPContext> {
  const current = WorkspaceStore.getCurrent();
  const local = getLocalWorkspace();

  if (current.id === LOCAL_SPACE_ID) {
    return {
      spaceId: LOCAL_SPACE_ID,
      spaceName: local.name,
      spaceType: local.type,
      plan: local.plan,
      isLoggedIn: false,
      isLocalSpace: true,
      accessToken: null,
      features: local.features,
    };
  }

  const license = await LicenseStore.getOrRefresh(false);
  const cloud = license?.data.spaces.find((space: CloudSpace) => space.id === current.id);

  if (!cloud) {
    return {
      spaceId: LOCAL_SPACE_ID,
      spaceName: local.name,
      spaceType: local.type,
      plan: local.plan,
      isLoggedIn: false,
      isLocalSpace: true,
      accessToken: null,
      features: local.features,
    };
  }

  const token = await TokenStore.getValidToken();
  const workspace = cloudSpaceToWorkspace(cloud);

  return {
    spaceId: workspace.id,
    spaceName: workspace.name,
    spaceType: workspace.type,
    plan: workspace.plan,
    isLoggedIn: !!token,
    isLocalSpace: false,
    accessToken: token,
    features: workspace.features,
  };
}
