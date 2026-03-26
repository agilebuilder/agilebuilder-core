import { ResourceApi } from '../../../resource/api.js';
import { getCloudResourceDetailById } from '../../shared/index.js';
import type { CloudResourceListItem, ResourceDetail, Template } from '../../../shared/types.js';

export interface CloudTemplateContext {
  spaceId: string;
  accessToken: string | null;
}

export interface ResolvedCloudTemplate {
  item: CloudResourceListItem;
  detail: ResourceDetail;
}

export interface TemplateResourceRef {
  source: 'local' | 'cloud';
  spaceId: string;
  resourceId: string;
  spaceName?: string;
}

export async function searchCloudTemplates(
  context: CloudTemplateContext,
  query: string,
  limit = 20
): Promise<CloudResourceListItem[]> {
  if (!context.accessToken) {
    return [];
  }

  const result = await ResourceApi.searchResources(
    context.spaceId,
    {
      type: 'template',
      keyword: query,
      page: 1,
      pageSize: limit,
      sortBy: 'updatedAt',
      sortOrder: 'DESC',
    },
    context.accessToken
  );

  if (!result.success || !result.data) {
    return [];
  }

  return result.data.items.filter(item => item.type === 'template');
}

export async function findCloudTemplateByName(
  context: CloudTemplateContext,
  name: string
): Promise<CloudResourceListItem | null> {
  const exactMatches = await searchCloudTemplates(context, name, 50);
  const normalizedName = name.trim().toLowerCase();
  const exact = exactMatches.find(item => item.name.trim().toLowerCase() === normalizedName);
  if (exact) {
    return exact;
  }
  return exactMatches[0] || null;
}

export async function getCloudTemplateDetail(
  context: CloudTemplateContext,
  name: string
): Promise<ResolvedCloudTemplate | null> {
  if (!context.accessToken) {
    return null;
  }

  const item = await findCloudTemplateByName(context, name);
  if (!item) {
    return null;
  }

  const detailResult = await ResourceApi.getResourceDetail(item.spaceId || context.spaceId, item.id, context.accessToken);
  if (!detailResult.success || !detailResult.data || detailResult.data.type !== 'template') {
    return null;
  }

  return {
    item,
    detail: detailResult.data,
  };
}

export async function getCloudTemplateDetailById(
  context: CloudTemplateContext,
  spaceId: string,
  resourceId: string
): Promise<ResolvedCloudTemplate | null> {
  if (!context.accessToken) {
    return null;
  }

  const resolved = await getCloudResourceDetailById({ spaceId, resourceId }, 'template');
  if (!resolved) {
    return null;
  }

  return {
    item: resolved.item,
    detail: resolved.detail,
  };
}

export function cloudDetailToTemplate(detail: ResourceDetail, fallbackName?: string): Template | null {
  if (detail.type !== 'template' || !detail.template) {
    return null;
  }

  const gitRepo = detail.template.definition?.source?.git?.repo;
  if (!gitRepo) {
    return null;
  }

  const gitBranch = detail.template.definition?.source?.git?.branch || 'main';
  const inquirerQuestions = detail.template.definition?.variables?.inquirerQuestions;

  return {
    id: Number.NaN,
    name: detail.name || fallbackName || 'Unnamed Template',
    type: 'template',
    description: detail.description || null,
    tags: JSON.stringify(detail.tags || []),
    created_at: detail.createdAt,
    updated_at: detail.updatedAt,
    git_url: gitRepo,
    branch: gitBranch,
    category: null,
    template_type: detail.template.sourceType || detail.template.definition?.source?.type || 'cloud',
    variables: JSON.stringify(inquirerQuestions || {}),
    post_clone_commands: JSON.stringify([]),
    clone_count: detail.template.usageCount || 0,
    last_cloned_at: null,
  };
}
