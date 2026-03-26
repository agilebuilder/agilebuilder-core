/**
 * 资源树本地缓存
 *
 * 支持离线模式访问资源树
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getDataDir } from '../shared/paths.js';
import type {
  WorkspaceTreeNode,
  ResourceTreeCacheStorage,
} from '../shared/types.js';

// 缓存目录
const CACHE_DIR = 'resource-cache';
// 缓存有效期（24小时）
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * 获取缓存目录路径
 */
function getCacheDir(): string {
  return join(getDataDir(), CACHE_DIR);
}

/**
 * 获取空间缓存文件路径
 */
function getCacheFilePath(spaceId: string): string {
  return join(getCacheDir(), `${spaceId}.json`);
}

/**
 * 确保缓存目录存在
 */
function ensureCacheDir(): void {
  const dir = getCacheDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * 资源树缓存管理器
 */
export class ResourceCache {
  private spaceId: string;
  private spaceName: string;
  private nodes: Map<string | null, WorkspaceTreeNode[]>;
  private updatedAt: number;

  constructor(spaceId: string, spaceName: string) {
    this.spaceId = spaceId;
    this.spaceName = spaceName;
    this.nodes = new Map();
    this.updatedAt = 0;
  }

  /**
   * 从本地加载缓存
   */
  static load(spaceId: string): ResourceCache | null {
    const filePath = getCacheFilePath(spaceId);
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const data: ResourceTreeCacheStorage = JSON.parse(content);

      const cache = new ResourceCache(data.spaceId, data.spaceName);
      cache.updatedAt = data.updatedAt;

      // 恢复 Map 结构
      for (const item of data.nodes) {
        cache.nodes.set(item.parentId, item.children);
      }

      return cache;
    } catch {
      return null;
    }
  }

  /**
   * 保存缓存到本地
   */
  save(): void {
    ensureCacheDir();

    // 转换 Map 为数组以便 JSON 序列化
    const nodesArray: ResourceTreeCacheStorage['nodes'] = [];
    for (const [parentId, children] of this.nodes) {
      nodesArray.push({ parentId, children });
    }

    const data: ResourceTreeCacheStorage = {
      spaceId: this.spaceId,
      spaceName: this.spaceName,
      updatedAt: this.updatedAt,
      nodes: nodesArray,
    };

    const filePath = getCacheFilePath(this.spaceId);
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * 检查缓存是否过期
   */
  isExpired(): boolean {
    return Date.now() - this.updatedAt > CACHE_TTL;
  }

  /**
   * 获取缓存更新时间
   */
  getUpdatedAt(): number {
    return this.updatedAt;
  }

  /**
   * 设置节点的子节点
   */
  setChildren(parentId: string | null, children: WorkspaceTreeNode[]): void {
    this.nodes.set(parentId, children);
    this.updatedAt = Date.now();
  }

  /**
   * 获取节点的子节点
   */
  getChildren(parentId: string | null): WorkspaceTreeNode[] | null {
    return this.nodes.get(parentId) || null;
  }

  /**
   * 检查是否有指定节点的缓存
   */
  hasChildren(parentId: string | null): boolean {
    return this.nodes.has(parentId);
  }

  /**
   * 清除缓存
   */
  clear(): void {
    this.nodes.clear();
    this.updatedAt = 0;
  }

  /**
   * 获取空间名称
   */
  getSpaceName(): string {
    return this.spaceName;
  }
}
