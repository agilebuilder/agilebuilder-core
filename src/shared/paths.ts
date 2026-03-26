/**
 * 路径管理工具
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';
import { DB_NAME } from './constants.js';

/**
 * 获取 AgileBuilder 数据目录
 * 
 * v2 版本使用独立子目录，避免与 v1 数据冲突
 * 路径：~/.agilebuilder/v2/
 */
export function getDataDir(): string {
  return join(homedir(), '.agilebuilder', 'v2');
}

export function getLogsDir(): string {
  return join(getDataDir(), 'logs');
}

/**
 * 获取数据库文件路径
 */
export function getDbPath(): string {
  return join(getDataDir(), DB_NAME);
}

/**
 * 验证目标路径是否安全
 */
export function validateTargetPath(targetPath: string): { valid: boolean; error?: string } {
  // 禁止的系统路径
  const forbiddenPaths = [
    '/usr',
    '/etc',
    '/bin',
    '/sbin',
    '/boot',
    '/sys',
    '/proc',
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
  ];

  // 检查是否在禁止路径中
  for (const forbidden of forbiddenPaths) {
    if (targetPath.startsWith(forbidden)) {
      return {
        valid: false,
        error: `Cannot clone to system directory: ${forbidden}`,
      };
    }
  }

  return { valid: true };
}

/**
 * 检查目录是否为空
 * @param dirPath 目录路径
 * @returns 如果目录不存在或为空返回 true，否则返回 false
 */
export function isDirectoryEmpty(dirPath: string): boolean {
  if (!existsSync(dirPath)) {
    return true; // 目录不存在，视为空
  }
  
  try {
    const files = readdirSync(dirPath);
    return files.length === 0;
  } catch (error) {
    // 如果无法读取目录，返回 false
    return false;
  }
}

/**
 * 规范化路径
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

// ============================================
// Auth 相关路径（Pro 功能）
// ============================================

/**
 * 获取认证数据文件路径
 */
export function getAuthFilePath(): string {
  return join(getDataDir(), 'auth.dat');
}

/**
 * 获取 License 数据文件路径
 */
export function getLicenseFilePath(): string {
  return join(getDataDir(), 'license.dat');
}

/**
 * 获取当前 Space 配置文件路径
 */
export function getCurrentSpaceFilePath(): string {
  return join(getDataDir(), 'current-space.json');
}

/**
 * 获取设备 ID 文件路径
 */
export function getDeviceFilePath(): string {
  return join(getDataDir(), '.device');
}

/**
 * 检查是否为开发模式
 */
export function isDevMode(): boolean {
  return process.env.AGILEBUILDER_DEV === 'true' || process.env.NODE_ENV === 'development';
}

/**
 * 获取 Pro 模块目录路径
 */
export function getProModulesDir(): string {
  return join(getDataDir(), 'modules', 'pro');
}

/**
 * 获取 Pro 模块文件路径
 *
 * 统一使用用户数据目录：~/.agilebuilder/v2/modules/pro/index.js
 * CLI 和桌面端共享同一个模块路径，避免环境差异导致的问题
 */
export function getProModuleFilePath(): string {
  return join(getProModulesDir(), 'index.js');
}

/**
 * 获取忽略版本文件路径
 *
 * 存储用户选择忽略的版本号，不再提示更新
 */
export function getIgnoredVersionsFilePath(): string {
  return join(getDataDir(), 'ignored-versions.json');
}

/**
 * 获取 CLI 配置文件路径
 *
 * 存储用户 CLI 偏好设置，例如语言模式。
 */
export function getCliConfigFilePath(): string {
  return join(getDataDir(), 'config.json');
}

/**
 * 获取 CLI 初始化标记文件路径
 *
 * 用于标记首次运行初始化是否已完成，避免重复执行初始化提示。
 */
export function getCliInitMarkerFilePath(): string {
  return join(getDataDir(), '.initialized');
}

export function getAuthRefreshLogFilePath(): string {
  return join(getLogsDir(), 'auth-refresh.log');
}
