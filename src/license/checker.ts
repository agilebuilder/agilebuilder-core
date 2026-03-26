/**
 * 权益检查器
 * 
 * 统一的权益检查入口，整合 License 和 Space 信息
 */

import { TokenStore } from '../auth/token-store.js';
import { LicenseStore } from './license-store.js';
import { SpaceManager } from './space.js';
import { LicenseApi } from './api.js';
import { DeviceApi } from '../device/device-api.js';
import { t } from '../i18n/index.js';

/**
 * Pro 功能列表
 */
export const PRO_FEATURES = {
  TEMPLATE_ADVANCED: 'template-advanced',    // 高级模板操作
  CLONE_WITH_VARIABLES: 'clone-with-variables', // 变量替换克隆
  HOOKS: 'hooks',                             // 生命周期钩子
  SYNC: 'sync',                               // 多设备同步
} as const;

export type ProFeature = typeof PRO_FEATURES[keyof typeof PRO_FEATURES];

/**
 * 权益检查结果
 */
export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
  suggestion?: string;
}

/**
 * 权益检查器
 */
export class AccessChecker {
  private static async ensureDeviceRegistered(): Promise<{
    success: boolean;
    error?: string;
  }> {
    const result = await DeviceApi.register();
    if (!result.success) {
      return {
        success: false,
        error: result.error || t('device.registerFailed'),
      };
    }

    return { success: true };
  }
  
  /**
   * 检查是否已登录
   */
  static isLoggedIn(): boolean {
    return TokenStore.isAuthenticated();
  }
  
  /**
   * 检查是否有有效的 License
   */
  static hasValidLicense(): boolean {
    const data = LicenseStore.getValidLicenseData();
    return data !== null;
  }
  
  /**
   * 检查是否有 Pro 权限
   */
  static hasProAccess(): boolean {
    // 检查 License
    if (!LicenseStore.hasProAccess()) {
      return false;
    }
    
    // 检查当前 Space
    return SpaceManager.isProPlan();
  }
  
  /**
   * 检查是否有指定功能权限
   */
  static hasFeature(feature: ProFeature): AccessCheckResult {
    // 未登录
    if (!this.isLoggedIn()) {
      return {
        allowed: false,
        reason: t('license.loginRequiredReason'),
        suggestion: t('license.loginRequiredSuggestion'),
      };
    }
    
    // 未选择 Space
    const currentSpace = SpaceManager.getCurrentSpaceInfo();
    if (!currentSpace) {
      return {
        allowed: false,
        reason: t('license.workspaceRequiredReason'),
        suggestion: t('license.workspaceRequiredSuggestion'),
      };
    }
    
    // 检查功能权限
    if (!SpaceManager.hasFeature(feature)) {
      return {
        allowed: false,
        reason: t('license.featureUnsupportedReason', { spaceName: currentSpace.name }),
        suggestion: t('license.featureUnsupportedSuggestion'),
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * 确保已登录
   */
  static requireLogin(): AccessCheckResult {
    if (!this.isLoggedIn()) {
      return {
        allowed: false,
        reason: t('license.loginRequiredReason'),
        suggestion: t('license.loginRequiredSuggestion'),
      };
    }
    return { allowed: true };
  }
  
  /**
   * 确保已选择 Space
   */
  static requireSpace(): AccessCheckResult {
    const loginCheck = this.requireLogin();
    if (!loginCheck.allowed) return loginCheck;
    
    const currentSpace = SpaceManager.getCurrentSpaceInfo();
    if (!currentSpace) {
      return {
        allowed: false,
        reason: t('license.workspaceRequiredReason'),
        suggestion: t('license.workspaceRequiredSuggestion'),
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * 确保有 Pro 权限
   */
  static requirePro(): AccessCheckResult {
    const spaceCheck = this.requireSpace();
    if (!spaceCheck.allowed) return spaceCheck;
    
    if (!this.hasProAccess()) {
      const currentSpace = SpaceManager.getCurrentSpace();
      return {
        allowed: false,
        reason: t('license.proRequiredReason', { spaceName: currentSpace?.spaceName ?? '' }),
        suggestion: t('license.proRequiredSuggestion'),
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * 获取并缓存 License
   * 
   * 登录后调用，获取用户权益信息
   */
  static async fetchAndCacheLicense(): Promise<{
    success: boolean;
    error?: string;
  }> {
    // 获取有效的 Token
    const token = await TokenStore.getValidToken();
    if (!token) {
      return {
        success: false,
        error: t('auth.tokenExpiredOrMissing'),
      };
    }
    
    const deviceResult = await this.ensureDeviceRegistered();
    if (!deviceResult.success) {
      return deviceResult;
    }

    // 调用 API 获取 License
    const result = await LicenseApi.getLicense(token);
    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || t('license.fetchFailed'),
      };
    }

    const validation = LicenseStore.validateLicenseResponse(result.data, {
      enforceFreshness: true,
    });
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error || t('license.signatureVerifyFailed'),
      };
    }

    LicenseStore.save(result.data);

    return { success: true };
  }
  
  /**
   * 刷新 License（如果需要）
   */
  static async refreshLicenseIfNeeded(): Promise<void> {
    if (!LicenseStore.needsRefresh()) {
      return;
    }

    const token = await TokenStore.getValidToken();
    if (!token) return;

    const deviceResult = await this.ensureDeviceRegistered();
    if (!deviceResult.success) {
      return;
    }

    const result = await LicenseApi.refreshLicense(token);
    if (result.success && result.data) {
      const validation = LicenseStore.validateLicenseResponse(result.data, {
        enforceFreshness: true,
      });
      if (validation.valid) {
        LicenseStore.save(result.data);
      }
    }
  }
  
  /**
   * 获取当前状态摘要
   */
  static getStatusSummary(): {
    loggedIn: boolean;
    userName?: string;
    hasLicense: boolean;
    hasProAccess: boolean;
    currentSpace?: {
      name: string;
      plan: string;
    };
  } {
    const loggedIn = this.isLoggedIn();
    const user = TokenStore.getUser();
    const hasLicense = this.hasValidLicense();
    const hasProAccess = this.hasProAccess();
    const currentSpace = SpaceManager.getCurrentSpaceInfo();
    
    return {
      loggedIn,
      userName: user?.name,
      hasLicense,
      hasProAccess,
      currentSpace: currentSpace ? {
        name: currentSpace.name,
        plan: currentSpace.plan.type,
      } : undefined,
    };
  }
}
