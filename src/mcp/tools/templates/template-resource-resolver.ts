import { getMCPContext, prepareMCPCloudContext } from '../../context.js';
import { TemplatesDAO } from '../../../db/dao/templates.dao.js';
import { LOCAL_SPACE_ID } from '../../../shared/constants.js';
import { SpaceManager } from '../../../license/space.js';
import { ResourceApi } from '../../../resource/api.js';
import { getCloudTemplateDetailById, type TemplateResourceRef } from './cloud-template-utils.js';
import { t } from '../../../i18n/index.js';
import type { MCPToolResponse } from '../../../shared/types.js';

export class MCPTemplateResolutionError extends Error {
  readonly mcpError: NonNullable<MCPToolResponse['error']>;

  constructor(mcpError: NonNullable<MCPToolResponse['error']>) {
    super(mcpError.message);
    this.name = 'MCPTemplateResolutionError';
    this.mcpError = mcpError;
  }
}

export async function resolveTemplateResourceRef(input: {
  context?: ReturnType<typeof getMCPContext>;
  requestedSpaceId?: string;
  resourceId: string;
}): Promise<TemplateResourceRef> {
  const context = input.context ?? getMCPContext();
  const { requestedSpaceId, resourceId } = input;

  if (isLocalResourceId(resourceId)) {
    return await resolveLocalTemplateResourceRef({
      context,
      requestedSpaceId,
      resourceId,
    });
  }

  if (!isCloudResourceId(resourceId)) {
    throw new MCPTemplateResolutionError({
      code: 'INVALID_RESOURCE_ID_FORMAT',
      message: t('mcp.templates.unsupportedResourceIdFormat', { resourceId }),
      suggestion: t('mcp.templates.useListHint'),
      category: 'validation',
      retryable: false,
      metadata: { resourceId },
    });
  }

  return await resolveCloudTemplateResourceRef({
    context,
    requestedSpaceId,
    resourceId,
  });
}

function isLocalResourceId(resourceId: string): boolean {
  return /^\d+$/.test(resourceId);
}

function isCloudResourceId(resourceId: string): boolean {
  return /^res_[a-z0-9]+_[a-z0-9]+$/i.test(resourceId);
}

async function resolveLocalTemplateResourceRef(input: {
  context: ReturnType<typeof getMCPContext>;
  requestedSpaceId?: string;
  resourceId: string;
}): Promise<TemplateResourceRef> {
  const { context, requestedSpaceId, resourceId } = input;

  if (requestedSpaceId && requestedSpaceId !== LOCAL_SPACE_ID) {
    throw new MCPTemplateResolutionError({
      code: 'LOCAL_RESOURCE_SPACE_MISMATCH',
      message: t('mcp.templates.localResourceRequiresLocalSpace'),
      suggestion: t('mcp.templates.useListHint'),
      category: 'validation',
      retryable: false,
      metadata: { resourceId, requestedSpaceId },
    });
  }

  if (context.isLocalSpace) {
    const localTemplate = await TemplatesDAO.getByResourceId(resourceId);
    if (localTemplate) {
      return {
        source: 'local',
        spaceId: LOCAL_SPACE_ID,
        resourceId,
      };
    }
  }

  const crossSpaceAllowed = await isCrossSpaceSearchEnabled(context);
  if (!crossSpaceAllowed) {
    if (context.isLocalSpace) {
      throw new MCPTemplateResolutionError({
        code: 'LOCAL_RESOURCE_NOT_FOUND',
        message: t('mcp.templates.localResourceNotFoundCurrent', { resourceId }),
        suggestion: t('mcp.templates.useListHint'),
        category: 'resource',
        retryable: false,
        metadata: { resourceId, scope: 'current-local-space' },
      });
    }

    throw new MCPTemplateResolutionError({
      code: 'LOCAL_RESOURCE_CROSS_SPACE_DISABLED',
      message: t('mcp.templates.localResourceNoCrossSpace'),
      suggestion: t('mcp.templates.useListHint'),
      category: 'resource',
      retryable: false,
      metadata: { resourceId },
    });
  }

  const fallbackTemplate = await TemplatesDAO.getByResourceId(resourceId);
  if (!fallbackTemplate) {
    throw new MCPTemplateResolutionError({
      code: 'LOCAL_RESOURCE_NOT_FOUND_CROSS_SPACE',
      message: t('mcp.templates.localResourceNotFoundCrossSpace', { resourceId }),
      suggestion: t('mcp.templates.useListHint'),
      category: 'resource',
      retryable: false,
      metadata: { resourceId, scope: 'cross-space' },
    });
  }

  return {
    source: 'local',
    spaceId: LOCAL_SPACE_ID,
    resourceId,
  };
}

async function resolveCloudTemplateResourceRef(input: {
  context: ReturnType<typeof getMCPContext>;
  requestedSpaceId?: string;
  resourceId: string;
}): Promise<TemplateResourceRef> {
  const { context, requestedSpaceId, resourceId } = input;

  if (requestedSpaceId === LOCAL_SPACE_ID) {
    throw new MCPTemplateResolutionError({
      code: 'CLOUD_RESOURCE_SPACE_MISMATCH',
      message: t('mcp.templates.cloudResourceCannotUseLocalSpace'),
      suggestion: t('mcp.templates.useListHint'),
      category: 'validation',
      retryable: false,
      metadata: { resourceId, requestedSpaceId },
    });
  }

  if (requestedSpaceId && requestedSpaceId !== LOCAL_SPACE_ID) {
    const cloudContext = await prepareCloudContextForTemplateResolution(context);
    const directMatch = await getCloudTemplateDetailById(cloudContext, requestedSpaceId, resourceId);
    if (!directMatch) {
      throw new MCPTemplateResolutionError({
        code: 'CLOUD_RESOURCE_NOT_FOUND_IN_SPACE',
        message: t('mcp.templates.cloudResourceNotFoundInSpace', { spaceId: requestedSpaceId, resourceId }),
        suggestion: t('mcp.templates.useListHint'),
        category: 'resource',
        retryable: false,
        metadata: { resourceId, requestedSpaceId },
      });
    }

    return {
      source: 'cloud',
      spaceId: directMatch.item.spaceId || requestedSpaceId,
      resourceId,
      spaceName: directMatch.item.spaceName,
    };
  }

  if (!context.isLocalSpace) {
    const cloudContext = await prepareCloudContextForTemplateResolution(context);
    const directMatch = await getCloudTemplateDetailById(cloudContext, context.spaceId, resourceId);
    if (directMatch) {
      return {
        source: 'cloud',
        spaceId: directMatch.item.spaceId || context.spaceId,
        resourceId,
        spaceName: directMatch.item.spaceName,
      };
    }
  }

  const crossSpaceAllowed = await isCrossSpaceSearchEnabled(context);
  if (!crossSpaceAllowed) {
    if (context.isLocalSpace) {
      throw new MCPTemplateResolutionError({
        code: 'CLOUD_RESOURCE_CROSS_SPACE_DISABLED_FROM_LOCAL',
        message: t('mcp.templates.cloudTemplateNoCrossSpaceFromLocal'),
        suggestion: t('mcp.templates.loginAndSelectCloud'),
        category: 'resource',
        retryable: false,
        metadata: { resourceId, scope: 'local-context' },
      });
    }

    throw new MCPTemplateResolutionError({
      code: 'CLOUD_RESOURCE_CROSS_SPACE_DISABLED',
      message: t('mcp.templates.cloudTemplateNoCrossSpaceInCurrent', { spaceName: context.spaceName }),
      suggestion: t('mcp.templates.useListHint'),
      category: 'resource',
      retryable: false,
      metadata: { resourceId, spaceName: context.spaceName },
    });
  }

  const fallbackMatch = await resolveCloudTemplateAcrossSpaces(resourceId, context);
  if (!fallbackMatch) {
    throw new MCPTemplateResolutionError({
      code: 'CLOUD_RESOURCE_NOT_FOUND_CROSS_SPACE',
      message: t('mcp.templates.cloudResourceNotFoundCrossSpace', { resourceId }),
      suggestion: t('mcp.templates.useListHint'),
      category: 'resource',
      retryable: false,
      metadata: { resourceId, scope: 'cross-space' },
    });
  }

  return {
    source: 'cloud',
    spaceId: fallbackMatch.item.spaceId,
    resourceId,
    spaceName: fallbackMatch.item.spaceName,
  };
}

async function prepareCloudContextForTemplateResolution(
  context: ReturnType<typeof getMCPContext>
): Promise<Awaited<ReturnType<typeof prepareMCPCloudContext>>> {
  if (!context.isLoggedIn) {
    throw new MCPTemplateResolutionError({
      code: 'AUTH_LOGIN_REQUIRED',
      message: t('mcp.templates.cloudTemplateLoginRequired'),
      suggestion: t('mcp.auth.loginRequiredSuggestion'),
      category: 'auth',
      retryable: false,
    });
  }

  if (!context.accessToken) {
    throw new MCPTemplateResolutionError({
      code: 'AUTH_TOKEN_UNAVAILABLE',
      message: t('mcp.templates.cloudAccessTokenMissing'),
      suggestion: t('mcp.auth.reloginSuggestion'),
      category: 'auth',
      retryable: false,
    });
  }

  return await prepareMCPCloudContext();
}

async function isCrossSpaceSearchEnabled(context: ReturnType<typeof getMCPContext>): Promise<boolean> {
  try {
    if (!context.isLoggedIn || !context.accessToken) {
      return false;
    }

    const result = await ResourceApi.getClientUserSettings(context.accessToken);
    if (!result.success || !result.data) {
      return false;
    }

    return result.data.mcp?.spaceIsolation === false;
  } catch {
    return false;
  }
}

async function resolveCloudTemplateAcrossSpaces(
  resourceId: string,
  context: ReturnType<typeof getMCPContext>
): Promise<Awaited<ReturnType<typeof getCloudTemplateDetailById>> | null> {
  const cloudContext = await prepareCloudContextForTemplateResolution(context);
  const candidateSpaceIds = getAccessibleCloudSpaceIds(context.spaceId);

  for (const spaceId of candidateSpaceIds) {
    if (spaceId === context.spaceId) {
      continue;
    }

    const resolved = await getCloudTemplateDetailById(cloudContext, spaceId, resourceId);
    if (resolved?.item?.spaceId) {
      return resolved;
    }
  }

  return null;
}

function getAccessibleCloudSpaceIds(currentSpaceId: string): string[] {
  const availableSpaces = SpaceManager.getAvailableSpaces()
    .filter((space: { id: string }) => !SpaceManager.isLocalSpace(space.id));

  const ordered = [
    currentSpaceId,
    ...availableSpaces.map((space: { id: string }) => space.id).filter((spaceId: string) => spaceId !== currentSpaceId),
  ];
  return Array.from(new Set(ordered));
}
