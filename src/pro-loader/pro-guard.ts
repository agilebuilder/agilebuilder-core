/**
 * Pro 功能权限守卫
 *
 * 用于在执行 Pro 功能前检查当前空间是否有 Pro 权限
 */

import chalk from 'chalk';
import { SpaceManager } from '../license/space.js';
import { isLoggedIn } from '../auth/index.js';
import { t } from '../i18n/index.js';

/**
 * Pro 功能类型
 */
export type ProFeatureType =
  | 'resource-operation'    // 资源操作（模板创建、Pipeline执行等）
  | 'template-advanced'     // 高级模板功能
  | 'clone-with-variables'  // 变量替换克隆
  | 'hooks'                 // 生命周期钩子
  | 'sync';                 // 多设备同步

/**
 * 功能描述映射
 */
const FEATURE_DESCRIPTIONS: Record<ProFeatureType, string> = {
  'resource-operation': '资源操作',
  'template-advanced': '高级模板功能',
  'clone-with-variables': '变量替换克隆',
  'hooks': '生命周期钩子',
  'sync': '多设备同步',
};

/**
 * 权限检查结果
 */
export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Pro 功能权限守卫
 */
export class ProGuard {

  /**
   * 检查当前空间是否有 Pro 权限
   *
   * @param feature 功能类型
   * @param options 选项
   * @returns 检查结果
   */
  static check(
    feature: ProFeatureType,
    options: { silent?: boolean } = {}
  ): GuardResult {
    const { silent = false } = options;

    // 检查登录状态
    if (!isLoggedIn()) {
      if (!silent) {
        console.log(chalk.yellow(`\n${t('pro.loginRequired')}`));
        console.log(chalk.dim(`${t('pro.loginHint')}\n`));
      }
      return {
        allowed: false,
        reason: t('pro.notLoggedInReason'),
      };
    }

    // 检查当前空间
    const currentSpace = SpaceManager.getCurrentSpace();
    const currentSpaceInfo = SpaceManager.getCurrentSpaceInfo();
    if (!currentSpace) {
      if (!silent) {
        console.log(chalk.yellow(`\n${t('pro.guard.workspaceNotSelected')}`));
        console.log(chalk.dim(`${t('pro.guard.selectWorkspaceHint')}\n`));
      }
      return {
        allowed: false,
        reason: t('pro.workspaceNotSelectedReason'),
      };
    }

    // 检查 Pro 权限
    if (!currentSpaceInfo || !SpaceManager.isProPlan()) {
      const featureName = FEATURE_DESCRIPTIONS[feature] || feature;
      const currentPlan = currentSpaceInfo?.plan.type || currentSpace.plan;
      if (!silent) {
        console.log(chalk.yellow(`\n${t('pro.guard.featureUnsupported', { feature: featureName })}`));
        console.log(chalk.dim(t('pro.guard.currentPlan', { plan: currentPlan })));
        console.log(chalk.dim(`${t('pro.guard.upgradeFeatureHint')}\n`));
      }
      return {
        allowed: false,
        reason: t('pro.notProPlanReason', {
          spaceName: currentSpaceInfo?.name || currentSpace.spaceName,
        }),
      };
    }

    return { allowed: true };
  }

  /**
   * 检查并拦截（如果没有权限则抛出错误）
   */
  static require(feature: ProFeatureType): void {
    const result = this.check(feature);
    if (!result.allowed) {
      throw new Error(result.reason);
    }
  }

  /**
   * 检查当前空间是否是 Pro 计划（静默检查）
   */
  static isProSpace(): boolean {
    return SpaceManager.isProPlan();
  }

  /**
   * 检查用户是否有任何 Pro 空间（静默检查）
   */
  static hasAnyProSpace(): boolean {
    return SpaceManager.hasAnyProSpace();
  }
}
