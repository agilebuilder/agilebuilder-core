/**
 * Pro 模块启动检查器
 *
 * 负责在 CLI 启动时检查 Pro 模块状态
 */

import chalk from 'chalk';
import { isLoggedIn } from '../auth/index.js';
import { LicenseStore } from '../license/license-store.js';
import { APP_VERSION } from '../shared/constants.js';
import { ProDownloader } from './downloader.js';
import { ProIntegrity } from './integrity.js';
import { t } from '../i18n/index.js';
import type { SpaceInfo } from '../shared/types.js';

/**
 * 版本比较
 * @returns -1 if a < b, 0 if a == b, 1 if a > b
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
 * 检查结果
 */
export interface ProCheckResult {
  shouldDownload: boolean;
  shouldUpdate: boolean;
  hasUpdate: boolean;
  canUpdate: boolean;
  currentVersion?: string;
  latestVersion?: string;
  minCliVersion?: string;
  changelog?: string;
  error?: string;
  recoveryHint?: string;
}

/**
 * 检查用户是否有任何 Pro 空间
 */
export function hasAnyProSpace(): boolean {
  const spaces = LicenseStore.getSpaces();
  return spaces.some(
    (space: SpaceInfo) => space.plan.type === 'pro' || space.plan.type === 'trial'
  );
}

/**
 * Pro 模块启动检查器
 */
export class ProChecker {
  /**
   * 执行启动检查
   *
   * 检查流程：
   * 1. 检查用户是否登录
   * 2. 检查用户是否有任何 Pro 空间
   * 3. 检查 Pro 模块是否已下载
   * 4. 检查 Pro 模块完整性
   * 5. 检查是否有更新
   */
  static async check(): Promise<ProCheckResult> {
    // 1. 检查登录状态
    if (!isLoggedIn()) {
      return {
        shouldDownload: false,
        shouldUpdate: false,
        hasUpdate: false,
        canUpdate: false,
      };
    }

    // 2. 检查是否有任何 Pro 空间
    if (!hasAnyProSpace()) {
      return {
        shouldDownload: false,
        shouldUpdate: false,
        hasUpdate: false,
        canUpdate: false,
      };
    }

    // 3. 检查模块是否存在
    if (!ProIntegrity.exists()) {
      return {
        shouldDownload: true,
        shouldUpdate: false,
        hasUpdate: false,
        canUpdate: false,
      };
    }

    // 4. 检查模块完整性
    const integrityResult = ProIntegrity.quickCheck();
    if (!integrityResult.valid) {
      return {
        shouldDownload: true,
        shouldUpdate: false,
        hasUpdate: false,
        canUpdate: false,
        error: integrityResult.reason,
        recoveryHint: integrityResult.recoveryHint,
      };
    }

    const currentVersion = integrityResult.meta?.version;

    // 5. 检查更新（静默失败）
    try {
      const updateInfo = await ProDownloader.checkUpdate();

      if (updateInfo.error) {
        // 网络错误等，静默处理
        return {
          shouldDownload: false,
          shouldUpdate: false,
          hasUpdate: false,
          canUpdate: false,
          currentVersion,
        };
      }

      if (updateInfo.hasUpdate && updateInfo.latestVersion) {
        // 检查 CLI 版本兼容性
        // 从 checkUpdate 返回的数据中获取 minCliVersion
        const versionResponse = await this.getLatestVersionInfo();
        const minCliVersion = versionResponse?.minCliVersion;

        // 如果最新版要求的 CLI 版本 <= 当前 CLI 版本，则可以更新
        const canUpdate = !minCliVersion || compareVersion(APP_VERSION, minCliVersion) >= 0;

        return {
          shouldDownload: false,
          shouldUpdate: canUpdate,
          hasUpdate: true,
          canUpdate,
          currentVersion,
          latestVersion: updateInfo.latestVersion,
          minCliVersion,
          changelog: updateInfo.changelog,
        };
      }

      return {
        shouldDownload: false,
        shouldUpdate: false,
        hasUpdate: false,
        canUpdate: false,
        currentVersion,
      };
    } catch {
      // 网络错误，静默处理
      return {
        shouldDownload: false,
        shouldUpdate: false,
        hasUpdate: false,
        canUpdate: false,
        currentVersion,
      };
    }
  }

  /**
   * 获取最新版本详细信息
   */
  private static async getLatestVersionInfo(): Promise<{
    version: string;
    minCliVersion: string;
    changelog: string;
  } | null> {
    try {
      const updateInfo = await ProDownloader.checkUpdate();
      if (!updateInfo.hasUpdate) return null;

      // checkUpdate 已经返回了这些信息
      return {
        version: updateInfo.latestVersion || '',
        minCliVersion: '', // 需要从 API 获取
        changelog: updateInfo.changelog || '',
      };
    } catch {
      return null;
    }
  }

  /**
   * 执行启动时的自动处理
   *
   * 根据检查结果自动下载或提示更新
   */
  static async runStartupCheck(options: {
    silent?: boolean;
    autoDownload?: boolean;
  } = {}): Promise<void> {
    const { silent = false, autoDownload = true } = options;

    const result = await this.check();

    // 需要下载
    if (result.shouldDownload && autoDownload) {
      if (!silent) {
        if (result.error) {
          console.log(chalk.yellow(`\n${t('pro.runtime.localCacheInvalidated', { reason: result.error })}`));
          if (result.recoveryHint) {
            console.log(chalk.dim(`   ${result.recoveryHint}`));
          }
          console.log(chalk.dim(`   ${t('pro.runtime.redownloadingAfterInvalidation')}`));
        }
        console.log(chalk.dim(`\n${t('pro.downloading')}`));
      }

      const downloadResult = await ProDownloader.download();

      if (downloadResult.success) {
        if (!silent) {
          console.log(chalk.dim(t('pro.runtime.ready', { version: downloadResult.version })));
        }
      } else {
        if (!silent) {
          console.log(chalk.yellow(`\n${t('pro.downloadFailed', { error: downloadResult.error })}`));
          console.log(chalk.dim(t('pro.runtime.downloadPartialHint')));
        }
      }
      return;
    }

    // 有更新且可以更新
    if (result.hasUpdate && result.canUpdate && !silent) {
      console.log();
      console.log(chalk.cyan(t('pro.runtime.startupUpdateAvailable', { currentVersion: result.currentVersion, latestVersion: result.latestVersion })));
      if (result.changelog) {
        console.log(chalk.dim(`   ${result.changelog}`));
      }
      console.log(chalk.dim(`   ${t('pro.updateHint')}`));
      console.log();
    }

    // 有更新但 CLI 版本不兼容
    if (result.hasUpdate && !result.canUpdate && !silent) {
      console.log();
      console.log(chalk.yellow(t('pro.runtime.startupUpdateRequiresCli', { latestVersion: result.latestVersion, minCliVersion: result.minCliVersion })));
      console.log(chalk.dim(`   ${t('pro.currentCliVersion')}: ${APP_VERSION}`));
      console.log(chalk.dim(t('pro.runtime.upgradeCliFirst')));
      console.log();
    }
  }
}
