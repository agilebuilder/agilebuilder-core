/**
 * 登出功能
 */

import { TokenStore } from './token-store.js';
import { existsSync, unlinkSync } from 'fs';
import { getLicenseFilePath, getCurrentSpaceFilePath } from '../shared/paths.js';
import { t } from '../i18n/index.js';

/**
 * 登出结果
 */
export interface LogoutResult {
  success: boolean;
  message: string;
}

/**
 * 执行登出
 * 
 * 清除所有本地认证数据：
 * - auth.dat (Token)
 * - license.dat (License)
 * - current-space.json (当前 Space)
 */
export function logout(): LogoutResult {
  try {
    // 清除 Token
    TokenStore.clear();
    
    // 清除 License
    const licensePath = getLicenseFilePath();
    if (existsSync(licensePath)) {
      unlinkSync(licensePath);
    }
    
    // 清除当前 Space
    const spacePath = getCurrentSpaceFilePath();
    if (existsSync(spacePath)) {
      unlinkSync(spacePath);
    }
    
    return {
      success: true,
      message: t('auth.logout.success'),
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : t('auth.logout.failed'),
    };
  }
}

/**
 * 检查是否已登录
 */
export function isLoggedIn(): boolean {
  return TokenStore.isAuthenticated();
}
