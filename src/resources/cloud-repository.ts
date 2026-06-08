import { ClientApi } from '../client/client-api.js';
import { AppError } from '../errors/app-error.js';
import { TokenStore } from '../auth/token-store.js';
import type { AddDocInput, AddTemplateInput, ResourceType, UpdateResourceInput } from './types.js';

async function requireToken(): Promise<string> {
  const token = await TokenStore.getValidToken();
  if (!token) {
    throw new AppError({
      code: 'AUTH_TOKEN_UNAVAILABLE',
      message: 'Login is required for cloud resources.',
      suggestion: 'Run ag login or ag login --api-key <key>.',
      category: 'auth',
    });
  }
  return token;
}

export class CloudResourceRepository {
  async list(input: {
    spaceId: string;
    type?: ResourceType;
    keyword?: string;
  }) {
    const token = await requireToken();
    return ClientApi.searchResources(token, input.spaceId, {
      type: input.type,
      keyword: input.keyword,
      pageSize: 100,
    });
  }

  async get(spaceId: string, resourceId: string) {
    const token = await requireToken();
    return ClientApi.getResourceDetail(token, spaceId, resourceId);
  }

  async addTemplate(spaceId: string, input: AddTemplateInput & { parentId?: string }) {
    const token = await requireToken();
    return ClientApi.createResource(token, spaceId, {
      type: 'template',
      name: input.name,
      parentId: input.parentId,
      description: input.description,
      tags: input.tags,
      gitUrl: input.gitUrl,
      branch: input.branch,
      subdir: input.subdir,
    });
  }

  async addDoc(spaceId: string, input: AddDocInput & { parentId?: string }) {
    const token = await requireToken();
    return ClientApi.createResource(token, spaceId, {
      type: 'doc',
      name: input.name,
      parentId: input.parentId,
      description: input.description,
      tags: input.tags,
      uri: input.uri,
      content: input.content,
      format: input.format,
    });
  }

  async update(spaceId: string, resourceId: string, input: UpdateResourceInput & { parentId?: string }) {
    const token = await requireToken();
    return ClientApi.updateResource(token, spaceId, resourceId, input);
  }

  async remove(spaceId: string, resourceId: string): Promise<void> {
    const token = await requireToken();
    await ClientApi.deleteResource(token, spaceId, resourceId);
  }

  async recordAccess(spaceId: string, resourceId: string): Promise<void> {
    const token = await requireToken();
    await ClientApi.recordResourceAccess(token, spaceId, resourceId);
  }
}
