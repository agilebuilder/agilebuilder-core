import { ClientApi } from '../client/client-api.js';
import { AppError } from '../errors/app-error.js';
import { TokenStore } from '../auth/token-store.js';
import { LicenseStore } from '../license/license-store.js';
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

/**
 * Best-effort CLI-side guard: reject cloud resource write operations when the
 * current workspace does not have an active Pro or Trial subscription.
 *
 * This is a UX optimization only. The backend is the authoritative enforcement
 * point and will block the request if the subscription check is bypassed.
 */
async function requireProAccess(spaceId: string): Promise<void> {
  try {
    const license = await LicenseStore.getOrRefresh();
    if (!license) {
      return;
    }
    // Some multi-space accounts grant Pro-level write access to the whole user
    // regardless of the per-space plan label. Honor that when the backend says so.
    if (license.data.user.hasPro) {
      return;
    }
    const space = license.data.spaces.find((s) => s.id === spaceId);
    if (!space) {
      return;
    }
    if (space.plan.type !== 'pro' && space.plan.type !== 'trial') {
      throw new AppError({
        code: 'PRO_ACCESS_REQUIRED',
        message: 'This workspace requires a Pro or Trial subscription to create, update, or delete cloud resources.',
        suggestion: 'Upgrade your workspace plan in the AgileBuilder web app, or switch to the local workspace with "ag space use local".',
        category: 'permission',
      });
    }
  } catch (err) {
    if (err instanceof AppError && err.code === 'PRO_ACCESS_REQUIRED') {
      throw err;
    }
    // Fail open on license lookup errors; the backend will enforce the real gate.
  }
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
    await requireProAccess(spaceId);
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
    await requireProAccess(spaceId);
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
    await requireProAccess(spaceId);
    const token = await requireToken();
    return ClientApi.updateResource(token, spaceId, resourceId, input);
  }

  async remove(spaceId: string, resourceId: string): Promise<void> {
    await requireProAccess(spaceId);
    const token = await requireToken();
    await ClientApi.deleteResource(token, spaceId, resourceId);
  }

  async recordAccess(spaceId: string, resourceId: string): Promise<void> {
    const token = await requireToken();
    await ClientApi.recordResourceAccess(token, spaceId, resourceId);
  }
}
