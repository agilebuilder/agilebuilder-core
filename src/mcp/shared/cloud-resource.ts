import { ResourceApi } from '../../resource/api.js';
import { prepareMCPCloudContext } from '../context.js';
import type { CloudResourceListItem, ResourceDetail, ResourceType } from '../../shared/types.js';

export interface MCPCloudResourceRef {
  spaceId: string;
  resourceId: string;
}

export interface ResolvedCloudResource {
  item: CloudResourceListItem;
  detail: ResourceDetail;
}

export async function getCloudResourceDetailById(
  ref: MCPCloudResourceRef,
  expectedType?: ResourceType
): Promise<ResolvedCloudResource | null> {
  const context = await prepareMCPCloudContext();
  const result = await ResourceApi.getResourceDetail(ref.spaceId, ref.resourceId, context.accessToken);

  if (!result.success || !result.data) {
    return null;
  }

  if (expectedType && result.data.type !== expectedType) {
    return null;
  }

  return {
    item: {
      id: result.data.id,
      spaceId: ref.spaceId,
      name: result.data.name,
      type: result.data.type,
      description: result.data.description,
      tags: result.data.tags || [],
      createdBy: '',
      createdAt: result.data.createdAt,
      updatedAt: result.data.updatedAt,
    },
    detail: result.data,
  };
}
