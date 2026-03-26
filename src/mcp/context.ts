/**
 * MCP 空间上下文管理
 *
 * 为 MCP 服务提供当前空间的上下文信息
 * 用于确定从哪个空间读取资源（模板、文档等）
 */

import { SpaceManager, LOCAL_SPACE_INFO } from '../license/space.js';
import { TokenStore } from '../auth/token-store.js';
import { LOCAL_SPACE_ID } from '../shared/constants.js';
import {
  CloudResourceLoginRequiredError,
  CloudResourceTokenUnavailableError,
  CloudSpaceRequiresProError,
  ProModuleDownloadError,
} from '../core/errors.js';
import { t } from '../i18n/index.js';
import type { MCPToolResponse } from '../shared/types.js';

/**
 * MCP 上下文信息
 */
export interface MCPContext {
  /** 当前空间 ID */
  spaceId: string;
  /** 当前空间名称 */
  spaceName: string;
  /** 空间类型 */
  spaceType: 'personal' | 'team';
  /** 计划类型 */
  plan: 'free' | 'trial' | 'pro';
  /** 是否已登录 */
  isLoggedIn: boolean;
  /** 是否为本地空间 */
  isLocalSpace: boolean;
  /** Access Token（云端空间需要） */
  accessToken: string | null;
  /** 可用功能列表 */
  features: string[];
}

/**
 * 获取当前 MCP 上下文
 *
 * 逻辑：
 * 1. 已登录 + 已选空间 → 返回该空间上下文
 * 2. 未登录 / 未选空间 → 返回本地空间上下文
 */
export function getMCPContext(): MCPContext {
  const authData = TokenStore.load();
  const currentSpace = SpaceManager.getCurrentSpace();
  const currentSpaceInfo = SpaceManager.getCurrentSpaceInfo();

  // 未登录或未选择空间，使用本地空间
  if (!authData || !currentSpace) {
    return {
      spaceId: LOCAL_SPACE_ID,
      spaceName: LOCAL_SPACE_INFO.name,
      spaceType: LOCAL_SPACE_INFO.type,
      plan: 'free',
      isLoggedIn: false,
      isLocalSpace: true,
      accessToken: null,
      features: LOCAL_SPACE_INFO.features,
    };
  }

  // 已登录，检查当前空间是否有效
  if (!currentSpaceInfo) {
    // 空间无效，回退到本地空间
    return {
      spaceId: LOCAL_SPACE_ID,
      spaceName: LOCAL_SPACE_INFO.name,
      spaceType: LOCAL_SPACE_INFO.type,
      plan: 'free',
      isLoggedIn: true,
      isLocalSpace: true,
      accessToken: authData.accessToken,
      features: LOCAL_SPACE_INFO.features,
    };
  }

  // 返回当前空间上下文
  const isLocal = SpaceManager.isLocalSpace(currentSpace.spaceId);
  return {
    spaceId: currentSpace.spaceId,
    spaceName: currentSpaceInfo.name,
    spaceType: currentSpaceInfo.type,
    plan: currentSpaceInfo.plan.type,
    isLoggedIn: true,
    isLocalSpace: isLocal,
    accessToken: isLocal ? null : authData.accessToken,
    features: currentSpaceInfo.features,
  };
}

/**
 * 检查当前上下文是否支持云端资源
 */
export function supportsCloudResources(context: MCPContext): boolean {
  return context.isLoggedIn && !context.isLocalSpace && !!context.accessToken;
}

/**
 * 检查当前上下文是否为 Pro 计划
 */
export function isProContext(context: MCPContext): boolean {
  return context.plan === 'pro' || context.plan === 'trial';
}

export interface PreparedMCPCloudContext extends MCPContext {
  accessToken: string;
}

export async function prepareMCPCloudContext(): Promise<PreparedMCPCloudContext> {
  const context = getMCPContext();

  if (context.isLocalSpace || !context.isLoggedIn) {
    throw new CloudResourceLoginRequiredError();
  }

  const token = await TokenStore.getValidToken();
  if (!token) {
    throw new CloudResourceTokenUnavailableError();
  }

  return {
    ...context,
    accessToken: token,
  };
}

export function mapMCPError(error: unknown, fallback: {
  code: string;
  message: string;
  suggestion?: string;
  category?: 'auth' | 'permission' | 'network' | 'validation' | 'resource' | 'system';
  retryable?: boolean;
  details?: string;
  metadata?: Record<string, any>;
}): MCPToolResponse['error'] {
  if (error instanceof CloudResourceLoginRequiredError) {
    return {
      code: 'AUTH_LOGIN_REQUIRED',
      message: error.message,
      suggestion: t('mcp.auth.loginRequiredSuggestion'),
      category: 'auth',
      retryable: false,
      details: fallback.details,
      metadata: fallback.metadata,
    };
  }

  if (error instanceof CloudResourceTokenUnavailableError) {
    return {
      code: 'AUTH_TOKEN_UNAVAILABLE',
      message: error.message,
      suggestion: t('mcp.auth.reloginSuggestion'),
      category: 'auth',
      retryable: false,
      details: fallback.details,
      metadata: fallback.metadata,
    };
  }

  if (error instanceof CloudSpaceRequiresProError) {
    return {
      code: 'PERMISSION_PRO_REQUIRED',
      message: error.message,
      suggestion: t('mcp.auth.proOrLocalSuggestion'),
      category: 'permission',
      retryable: false,
      details: fallback.details,
      metadata: fallback.metadata,
    };
  }

  if (error instanceof ProModuleDownloadError) {
    return {
      code: 'SYSTEM_PRO_MODULE_DOWNLOAD_FAILED',
      message: error.message,
      suggestion: t('mcp.auth.proDownloadRetrySuggestion'),
      category: 'system',
      retryable: true,
      details: fallback.details,
      metadata: fallback.metadata,
    };
  }

  if (error instanceof Error) {
    return {
      code: fallback.code,
      message: error.message || fallback.message,
      suggestion: fallback.suggestion,
      details: fallback.details,
      category: fallback.category || 'system',
      retryable: fallback.retryable,
      metadata: fallback.metadata,
    };
  }

  return {
    code: fallback.code,
    message: fallback.message,
    suggestion: fallback.suggestion,
    details: fallback.details,
    category: fallback.category || 'system',
    retryable: fallback.retryable,
    metadata: fallback.metadata,
  };
}
