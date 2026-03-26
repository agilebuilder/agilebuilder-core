/**
 * Pro 模块管理器
 *
 * 整合下载、加载、更新等功能
 */

import chalk from 'chalk';
import { ProDownloader } from './downloader.js';
import { ProLoader } from './loader.js';
import { ProIntegrity } from './integrity.js';
import { SpaceManager } from '../license/space.js';
import { APP_VERSION } from '../shared/constants.js';
import { t } from '../i18n/index.js';
import type { ProModule, ProModuleMeta } from '../shared/types.js';

/**
 * 版本比较
 */
function compareVersion(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

/**
 * Pro 模块状态
 */
export interface ProModuleStatus {
  available: boolean;       // 是否可用（已下载）
  loaded: boolean;          // 是否已加载到内存
  version?: string;         // 当前版本
  hasUpdate?: boolean;      // 是否有更新
  canUpdate?: boolean;      // 是否可以更新（CLI版本兼容）
  latestVersion?: string;   // 最新版本
  minCliVersion?: string;   // 最新版要求的最低CLI版本
  changelog?: string;       // 更新日志
  integrity?: boolean;      // 完整性校验结果
  meta?: ProModuleMeta;     // 模块元信息
}

/**
 * Pro 模块管理器
 */
export class ProManager {

  /**
   * 获取 Pro 模块状态（包含详细信息）
   */
  static async getStatus(): Promise<ProModuleStatus> {
    const localVersion = ProDownloader.getLocalVersion();
    const loaderState = ProLoader.getState();

    const status: ProModuleStatus = {
      available: localVersion !== null,
      loaded: loaderState.loaded,
      version: localVersion || undefined,
    };

    // 检查完整性
    if (status.available) {
      const integrityResult = ProIntegrity.verify();
      status.integrity = integrityResult.valid;
      status.meta = integrityResult.meta;
    }

    // 检查更新
    try {
      const updateInfo = await ProDownloader.checkUpdate();
      if (updateInfo.hasUpdate && updateInfo.latestVersion) {
        status.hasUpdate = true;
        status.latestVersion = updateInfo.latestVersion;
        status.changelog = updateInfo.changelog;

        // 检查 CLI 版本兼容性（从 meta 获取 minCliVersion）
        // 注意：这里需要从 API 获取最新版的 minCliVersion
        // 暂时使用本地 meta 的 minCliVersion 作为参考
        if (status.meta?.minCliVersion) {
          status.minCliVersion = status.meta.minCliVersion;
          status.canUpdate = compareVersion(APP_VERSION, status.meta.minCliVersion) >= 0;
        } else {
          status.canUpdate = true;
        }
      }
    } catch {
      // 网络错误，静默处理
    }

    return status;
  }
  
  /**
   * 初始化 Pro 模块
   * 
   * 根据当前 Space 权限决定是否加载
   */
  static async init(): Promise<{
    success: boolean;
    reason?: string;
  }> {
    // 检查当前 Space 是否有 Pro 权限
    const currentSpace = SpaceManager.getCurrentSpace();
    if (!currentSpace) {
      return {
        success: false,
        reason: t('pro.workspaceNotSelectedReason'),
      };
    }
    
    const isProPlan = SpaceManager.isProPlan();
    if (!isProPlan) {
      return {
        success: false,
        reason: t('pro.notProPlanReason', { spaceName: currentSpace.spaceName }),
      };
    }
    
    // 下载并加载 Pro 模块
    const result = await ProLoader.load();
    
    if (!result.success) {
      return {
        success: false,
        reason: result.error,
      };
    }
    
    return { success: true };
  }
  
  /**
   * 在切换到 Pro Space 时检查并下载模块（不加载）
   * 
   * 加载是懒加载的，在真正需要 Pro 功能时再加载
   */
  static async onSpaceSwitch(plan: string): Promise<void> {
    const isProPlan = plan === 'pro' || plan === 'trial';
    
    if (isProPlan) {
      // 只检查是否需要下载，不加载到内存
      if (ProDownloader.needsDownload()) {
        console.log(chalk.dim(`\n${t('pro.downloading')}`));
        
        const result = await ProDownloader.download();
        
        if (result.success) {
          console.log(chalk.dim(t('pro.runtime.ready', { version: result.version })));
        } else {
          console.log(chalk.yellow(`\n${t('pro.downloadFailed', { error: result.error })}`));
          console.log(chalk.dim(t('pro.runtime.downloadPartialHint')));
        }
      }
    } else {
      // 切换到非 Pro 空间，卸载已加载的模块
      if (ProLoader.isLoaded()) {
        ProLoader.unload();
      }
    }
  }
  
  /**
   * 获取 Pro 模块（如果已加载）
   */
  static getModule(): ProModule | null {
    return ProLoader.getModule();
  }
  
  /**
   * 检查是否有指定的 Pro 功能
   */
  static hasFeature(feature: string): boolean {
    const module = ProLoader.getModule();
    if (!module) return false;
    
    // 检查模块是否有 getFeatures 方法
    const moduleAny = module as any;
    if (typeof moduleAny.getFeatures === 'function') {
      const features = moduleAny.getFeatures();
      return Array.isArray(features) && features.includes(feature);
    }
    
    return false;
  }
  
  /**
   * 强制重新下载 Pro 模块
   */
  static async forceUpdate(): Promise<{
    success: boolean;
    version?: string;
    error?: string;
  }> {
    // 先卸载
    ProLoader.unload();

    // 重新下载
    const downloadResult = await ProDownloader.download();
    if (!downloadResult.success) {
      return downloadResult;
    }

    // 重新加载
    const loadResult = await ProLoader.load();
    return {
      success: loadResult.success,
      version: loadResult.module?.version,
      error: loadResult.error,
    };
  }

  /**
   * 确保 Pro 模块已下载（基于任意 Pro 空间）
   *
   * 只要用户有任何一个 Pro 空间，就确保模块已下载
   */
  static async ensureDownloaded(): Promise<{
    success: boolean;
    version?: string;
    error?: string;
  }> {
    // 检查是否有任何 Pro 空间
    if (!SpaceManager.hasAnyProSpace()) {
      return {
        success: false,
        error: t('pro.noProSpaceError'),
      };
    }

    // 检查模块是否存在且完整
    const integrityResult = ProIntegrity.quickCheck();
    if (integrityResult.valid) {
      return {
        success: true,
        version: integrityResult.meta?.version,
      };
    }

    // 下载模块
    return ProDownloader.download();
  }

  /**
   * 验证模块完整性
   */
  static verifyIntegrity(): {
    valid: boolean;
    reason?: string;
    recoveryHint?: string;
  } {
    const result = ProIntegrity.verify();
    return {
      valid: result.valid,
      reason: result.reason,
      recoveryHint: result.recoveryHint,
    };
  }

  /**
   * 获取详细信息（用于 pro info 命令）
   */
  static getDetailedInfo(): {
    available: boolean;
    version?: string;
    minCliVersion?: string;
    sha256?: string;
    size?: number;
    updatedAt?: string;
    features?: string[];
    integrity?: boolean;
  } {
    const meta = ProIntegrity.getMeta();
    if (!meta) {
      return { available: false };
    }

    const integrityResult = ProIntegrity.verify();

    return {
      available: true,
      version: meta.version,
      minCliVersion: meta.minCliVersion,
      sha256: meta.sha256,
      size: meta.size,
      updatedAt: meta.updatedAt,
      features: meta.features,
      integrity: integrityResult.valid,
    };
  }
}
