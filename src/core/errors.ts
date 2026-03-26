/**
 * 核心错误类型定义
 */

import { t } from '../i18n/index.js';

/**
 * 云端空间需要Pro订阅错误
 */
export class CloudSpaceRequiresProError extends Error {
  constructor(spaceName: string) {
    super(t('core.cloudSpaceRequiresPro', { spaceName }));
    this.name = 'CloudSpaceRequiresProError';
  }
}

/**
 * Pro 模块缺失错误
 */
export class ProModuleMissingError extends Error {
  constructor(message: string = t('core.proModuleMissing')) {
    super(message);
    this.name = 'ProModuleMissingError';
  }
}

/**
 * Pro 模块下载失败错误
 */
export class ProModuleDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProModuleDownloadError';
  }
}

/**
 * 云端资源执行需要登录错误
 */
export class CloudResourceLoginRequiredError extends Error {
  constructor(message: string = t('core.cloudResourceLoginRequired')) {
    super(message);
    this.name = 'CloudResourceLoginRequiredError';
  }
}

/**
 * 云端资源执行时 Token 不可用错误
 */
export class CloudResourceTokenUnavailableError extends Error {
  constructor(message: string = t('core.cloudResourceTokenUnavailable')) {
    super(message);
    this.name = 'CloudResourceTokenUnavailableError';
  }
}
