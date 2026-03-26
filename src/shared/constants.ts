/**
 * 全局常量定义
 */

import { createRequire } from 'module';
import { BACKEND_PROFILE_ENDPOINTS } from '../config/backend-profiles.js';
import { CliConfigStore } from '../config/store.js';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version?: string };
const PACKAGE_VERSION = packageJson.version || '0.0.0';

export const APP_NAME = 'agilebuilder';
export const APP_SHORT_NAME = 'ag';
export const APP_VERSION = PACKAGE_VERSION;

// 客户端类型标识
export const CLIENT_TYPE = 'cli';

// 数据库配置
export const DB_NAME = 'templates.db';

// 默认配置
export const DEFAULT_BRANCH = 'main';
export const DEFAULT_TEMPLATE_TYPE = 'project';

// MCP 配置
export const MCP_SERVER_NAME = 'agilebuilder-mcp';
export const MCP_VERSION = PACKAGE_VERSION;

// UI 配置
export const UI_DEFAULT_PORT = 3456;
export const UI_HOST = '127.0.0.1';

// ============================================
// Auth 配置（Pro 功能）
// ============================================

function getResolvedBackendEndpoints() {
  const profile = CliConfigStore.getResolvedBackendProfile();
  return BACKEND_PROFILE_ENDPOINTS[profile];
}

// SSO 服务地址
export function getSsoBaseUrl(): string {
  return getResolvedBackendEndpoints().ssoUrl;
}

// Workspace API 地址
export function getWorkspaceApiUrl(): string {
  return getResolvedBackendEndpoints().workspaceUrl;
}

// OAuth 配置
export const OAUTH_CLIENT_ID = 'agilebuilder-cli';
export const OAUTH_CALLBACK_PORT = 51280;  // 5位数小众端口
export const OAUTH_CALLBACK_PORT_MAX_ATTEMPTS = 10;  // 最大尝试次数

// 缓存配置
export const LICENSE_CACHE_TTL = 60 * 60 * 1000; // 1小时
export const TOKEN_REFRESH_THRESHOLD = 60 * 1000; // Token 过期前 1 分钟刷新

// ============================================
// 本地空间配置
// ============================================

export const LOCAL_SPACE_ID = '__local__';
export const LOCAL_SPACE_NAME = '本地空间';
