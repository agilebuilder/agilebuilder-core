import { AppError } from '../../errors/app-error.js';
import { LOCAL_SPACE_ID } from '../../shared/constants.js';
import { LocalResourceRepository } from '../../resources/local-repository.js';
import { CloudResourceRepository } from '../../resources/cloud-repository.js';
import { LicenseStore } from '../../license/license-store.js';
import { ClientApi } from '../../client/client-api.js';
import { cloudResourceToGenerateOptions } from '../../template/cloud-resource.js';
import type { MCPContext } from '../context.js';
import type { TemplateConfig } from '../../template/config.js';

const localRepository = new LocalResourceRepository();
const cloudRepository = new CloudResourceRepository();

export interface ResolvedTemplate {
  resourceId: string;
  spaceId: string;
  gitUrl: string;
  branch?: string;
  subdir?: string;
  templateConfig?: TemplateConfig;
  source: 'local' | 'cloud';
}

export async function resolveTemplateResourceRef(
  context: MCPContext,
  resourceId: string,
): Promise<ResolvedTemplate> {
  if (context.isLocalSpace) {
    const local = await localRepository.require(resourceId);
    if (local.type !== 'template') {
      throw new AppError({
        code: 'CREATE_REQUIRES_TEMPLATE',
        message: `Resource ${resourceId} is not a template.`,
        category: 'validation',
      });
    }
    return {
      resourceId,
      spaceId: LOCAL_SPACE_ID,
      gitUrl: local.gitUrl,
      branch: local.branch,
      subdir: local.subdir,
      source: 'local',
    };
  }

  // Try current cloud space first
  try {
    const cloud = await cloudRepository.get(context.spaceId, resourceId);
    const source = cloudResourceToGenerateOptions(cloud);
    return {
      resourceId,
      spaceId: context.spaceId,
      gitUrl: source.gitUrl,
      branch: source.branch,
      subdir: source.subdir,
      templateConfig: source.templateConfig,
      source: 'cloud',
    };
  } catch (error) {
    if (!isResourceNotFoundError(error)) {
      throw error;
    }
  }

  if (!context.accessToken) {
    throw new AppError({
      code: 'RESOURCE_NOT_FOUND',
      message: `Resource ${resourceId} not found in workspace ${context.spaceId}.`,
      category: 'resource',
    });
  }

  const settings = await ClientApi.getClientUserSettings(context.accessToken);
  const allowCrossSpace = settings.mcp?.spaceIsolation === false;

  if (!allowCrossSpace) {
    throw new AppError({
      code: 'CLOUD_RESOURCE_CROSS_SPACE_DISABLED',
      message: `Resource ${resourceId} not found in current workspace. Cross-space search is disabled by workspace policy (spaceIsolation is on).`,
      category: 'resource',
    });
  }

  const license = await LicenseStore.getOrRefresh(false);
  if (!license) {
    throw new AppError({
      code: 'RESOURCE_NOT_FOUND',
      message: `Resource ${resourceId} not found.`,
      category: 'resource',
    });
  }

  for (const space of license.data.spaces) {
    if (space.id === context.spaceId) continue;
    try {
      const cloud = await cloudRepository.get(space.id, resourceId);
      const source = cloudResourceToGenerateOptions(cloud);
      return {
        resourceId,
        spaceId: space.id,
        gitUrl: source.gitUrl,
        branch: source.branch,
        subdir: source.subdir,
        templateConfig: source.templateConfig,
        source: 'cloud',
      };
    } catch {
      // continue searching
    }
  }

  throw new AppError({
    code: 'RESOURCE_NOT_FOUND',
    message: `Resource ${resourceId} not found in any accessible workspace.`,
    category: 'resource',
  });
}

function isResourceNotFoundError(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return false;
  }
  return error.category === 'resource'
    || error.code === 'HTTP_404'
    || error.code === 'API_404'
    || /NOT_FOUND/i.test(error.code);
}
