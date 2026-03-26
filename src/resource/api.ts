/**
 * 资源树 API 客户端
 *
 * 调用 Cloud 后端的资源树相关接口
 */

import { ApiClient, RequestResult } from '../shared/api-client.js';
import type {
  CloudResourceListResponse,
  TreeResponse,
  BreadcrumbResponse,
  ResourceDetail,
  WorkspaceTreeNode,
} from '../shared/types.js';

export interface ClientUserSettingsResponse {
  mcp?: {
    spaceIsolation?: boolean;
  };
}

/**
 * 资源树 API
 */
export class ResourceApi {
  /**
   * 获取当前用户设置
   *
   * @param token Access Token
   */
  static async getClientUserSettings(
    token: string
  ): Promise<RequestResult<ClientUserSettingsResponse>> {
    return ApiClient.get<ClientUserSettingsResponse>(
      '/api/client/user/settings',
      { token }
    );
  }

  /**
   * 获取资源列表 / 搜索资源
   *
   * @param spaceId 空间 ID
   * @param options 查询参数
   * @param token Access Token
   */
  static async searchResources(
    spaceId: string,
    options: {
      type?: string;
      tags?: string;
      keyword?: string;
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: 'ASC' | 'DESC';
    },
    token: string
  ): Promise<RequestResult<CloudResourceListResponse>> {
    const params = new URLSearchParams();
    if (options.type) params.set('type', options.type);
    if (options.tags) params.set('tags', options.tags);
    if (options.keyword) params.set('keyword', options.keyword);
    if (options.page) params.set('page', String(options.page));
    if (options.pageSize) params.set('pageSize', String(options.pageSize));
    if (options.sortBy) params.set('sortBy', options.sortBy);
    if (options.sortOrder) params.set('sortOrder', options.sortOrder);
    const query = params.toString() ? `?${params.toString()}` : '';
    return ApiClient.get<CloudResourceListResponse>(
      `/api/client/spaces/${spaceId}/resources${query}`,
      { token }
    );
  }

  /**
   * 获取目录树（子节点列表）
   *
   * @param spaceId 空间 ID
   * @param parentId 父节点 ID（为空则获取根节点）
   * @param token Access Token
   */
  static async getTree(
    spaceId: string,
    parentId: string | null,
    token: string
  ): Promise<RequestResult<TreeResponse>> {
    const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
    return ApiClient.get<TreeResponse>(
      `/api/client/spaces/${spaceId}/tree${query}`,
      { token }
    );
  }

  /**
   * 获取指定节点的子节点
   *
   * @param spaceId 空间 ID
   * @param nodeId 节点 ID
   * @param token Access Token
   */
  static async getNodeChildren(
    spaceId: string,
    nodeId: string,
    token: string
  ): Promise<RequestResult<TreeResponse>> {
    return ApiClient.get<TreeResponse>(
      `/api/client/spaces/${spaceId}/tree/${nodeId}`,
      { token }
    );
  }

  /**
   * 获取面包屑路径
   *
   * @param spaceId 空间 ID
   * @param nodeId 节点 ID
   * @param token Access Token
   */
  static async getBreadcrumbs(
    spaceId: string,
    nodeId: string,
    token: string
  ): Promise<RequestResult<BreadcrumbResponse>> {
    return ApiClient.get<BreadcrumbResponse>(
      `/api/client/spaces/${spaceId}/tree/${nodeId}/breadcrumbs`,
      { token }
    );
  }

  /**
   * 获取资源详情
   *
   * @param spaceId 空间 ID
   * @param resourceId 资源 ID
   * @param token Access Token
   */
  static async getResourceDetail(
    spaceId: string,
    resourceId: string,
    token: string
  ): Promise<RequestResult<ResourceDetail>> {
    return ApiClient.get<ResourceDetail>(
      `/api/client/spaces/${spaceId}/resources/${resourceId}`,
      { token }
    );
  }

  /**
   * 记录资源访问
   *
   * @param spaceId 空间 ID
   * @param resourceId 资源 ID
   * @param token Access Token
   */
  static async recordAccess(
    spaceId: string,
    resourceId: string,
    token: string
  ): Promise<RequestResult<void>> {
    return ApiClient.post<void>(
      `/api/client/spaces/${spaceId}/resources/${resourceId}/access`,
      {},
      { token }
    );
  }
}
