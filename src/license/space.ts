/**
 * Space（工作空间）管理
 *
 * 管理用户当前选择的工作空间
 * 支持本地空间和云端空间
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { dirname } from 'path';
import { getCurrentSpaceFilePath } from '../shared/paths.js';
import { LOCAL_SPACE_ID, LOCAL_SPACE_NAME } from '../shared/constants.js';
import { LicenseStore } from './license-store.js';
import type { CurrentSpace, SpaceInfo } from '../shared/types.js';

/**
 * 本地空间信息（内置，始终存在）
 */
export const LOCAL_SPACE_INFO: SpaceInfo = {
  id: LOCAL_SPACE_ID,
  name: LOCAL_SPACE_NAME,
  type: 'personal',
  plan: { type: 'free', expiresAt: null, trialDaysRemaining: null },
  role: 'owner',
  features: ['local-templates'],
};

/**
 * Space 管理器
 */
export class SpaceManager {
  private static getAuthorizedCurrentSpaceInfo(): SpaceInfo | null {
    const current = this.getCurrentSpace();
    if (!current) {
      return null;
    }

    return this.findSpaceById(current.spaceId) || null;
  }

  /**
   * 判断是否为本地空间
   */
  static isLocalSpace(spaceId: string): boolean {
    return spaceId === LOCAL_SPACE_ID;
  }

  /**
   * 保存当前选择的 Space
   */
  static saveCurrentSpace(space: SpaceInfo): void {
    const spaceFile = getCurrentSpaceFilePath();
    const dir = dirname(spaceFile);
    
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    const currentSpace: CurrentSpace = {
      spaceId: space.id,
      spaceName: space.name,
      plan: space.plan.type,  // 提取计划类型
      features: space.features,
      selectedAt: Date.now(),
    };
    
    writeFileSync(spaceFile, JSON.stringify(currentSpace, null, 2), 'utf-8');
  }
  
  /**
   * 获取当前选择的 Space
   */
  static getCurrentSpace(): CurrentSpace | null {
    const spaceFile = getCurrentSpaceFilePath();
    
    if (!existsSync(spaceFile)) {
      return null;
    }
    
    try {
      const content = readFileSync(spaceFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  
  /**
   * 清除当前 Space 选择
   */
  static clearCurrentSpace(): void {
    const spaceFile = getCurrentSpaceFilePath();
    if (existsSync(spaceFile)) {
      unlinkSync(spaceFile);
    }
  }
  
  /**
   * 获取用户可用的 Space 列表（始终包含本地空间）
   */
  static getAvailableSpaces(): SpaceInfo[] {
    const cloudSpaces = LicenseStore.getSpaces();
    return [LOCAL_SPACE_INFO, ...cloudSpaces];
  }
  
  /**
   * 根据 ID 查找 Space（支持本地空间）
   */
  static findSpaceById(spaceId: string): SpaceInfo | undefined {
    if (spaceId === LOCAL_SPACE_ID) {
      return LOCAL_SPACE_INFO;
    }
    const cloudSpaces = LicenseStore.getSpaces();
    return cloudSpaces.find(s => s.id === spaceId);
  }
  
  /**
   * 切换到指定 Space
   */
  static switchSpace(spaceId: string): { success: boolean; space?: SpaceInfo; error?: string } {
    const space = this.findSpaceById(spaceId);
    
    if (!space) {
      return {
        success: false,
        error: `未找到 Space: ${spaceId}`,
      };
    }
    
    this.saveCurrentSpace(space);
    
    return {
      success: true,
      space,
    };
  }
  
  /**
   * 验证当前 Space 是否有效
   * 
   * 检查是否仍在用户的 Space 列表中
   */
  static isCurrentSpaceValid(): boolean {
    const current = this.getCurrentSpace();
    if (!current) return false;
    
    const space = this.findSpaceById(current.spaceId);
    return space !== undefined;
  }
  
  /**
   * 获取当前 Space 的完整信息
   */
  static getCurrentSpaceInfo(): SpaceInfo | null {
    return this.getAuthorizedCurrentSpaceInfo();
  }
  
  /**
   * 检查当前 Space 是否有指定功能
   */
  static hasFeature(feature: string): boolean {
    const currentSpace = this.getAuthorizedCurrentSpaceInfo();
    if (!currentSpace) {
      return false;
    }

    return currentSpace.features.includes(feature);
  }
  
  /**
   * 检查当前 Space 是否是 Pro 计划
   */
  static isProPlan(): boolean {
    const currentSpace = this.getAuthorizedCurrentSpaceInfo();
    if (!currentSpace) {
      return false;
    }

    return currentSpace.plan.type === 'pro' || currentSpace.plan.type === 'trial';
  }

  /**
   * 检查用户是否有任何 Pro 空间
   *
   * 只要有一个空间是 Pro 或 Trial 计划，就返回 true
   */
  static hasAnyProSpace(): boolean {
    const spaces = this.getAvailableSpaces();
    return spaces.some(
      space => space.plan.type === 'pro' || space.plan.type === 'trial'
    );
  }
}
