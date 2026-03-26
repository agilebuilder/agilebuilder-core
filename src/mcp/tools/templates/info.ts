/**
 * 获取模板详情 Tool
 *
 * 获取指定模板的详细信息
 */

import { getMCPContext, mapMCPError, prepareMCPCloudContext, supportsCloudResources } from '../../context.js';
import { createMCPErrorResponse, createMCPSuccessResponse, createTextToolResult } from '../../shared/index.js';
import { TemplatesDAO } from '../../../db/dao/templates.dao.js';
import { getCloudTemplateDetail, getCloudTemplateDetailById, TemplateResourceRef } from './cloud-template-utils.js';
import { t } from '../../../i18n/index.js';
import { parseJSON } from '../../../shared/utils.js';
import { LOCAL_SPACE_ID } from '../../../shared/constants.js';
import {
  MCPTemplateResolutionError,
  resolveTemplateResourceRef,
} from './template-resource-resolver.js';

/**
 * 模板详情（AI 友好格式）
 */
export interface TemplateDetail {
  /** 模板名称 */
  name: string;
  /** 模板描述 */
  description: string | null;
  /** 分类 */
  category: string | null;
  /** 标签列表 */
  tags: string[];
  /** 模板类型 */
  type: string;
  /** 使用次数 */
  usageCount: number;
  /** 最后使用时间 */
  lastUsedAt: string | null;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 是否支持变量 */
  supportsVariables: boolean;
  /** 变量配置（如果支持） */
  variables?: {
    enabled: boolean;
    questions?: Array<{
      name: string;
      type: string;
      message: string;
      default?: any;
    }>;
  };
  /** README 内容（如果有） */
  readme?: string;
  /** 来源信息 */
  source: {
    type: 'git' | 'upload' | 'editor' | 'local';
    gitUrl?: string;
    branch?: string;
  };
  /** 精准资源定位信息 */
  resource: TemplateResourceRef;
  /** 使用建议 */
  usageHint: string;
}

/**
 * getTemplateInfo 参数
 */
export interface GetTemplateInfoArgs {
  /** 模板名称（必需） */
  name?: string;
  /** 空间 ID（推荐，精准查询） */
  spaceId?: string;
  /** 资源 ID（推荐，精准查询） */
  resourceId?: string;
}

/**
 * 获取模板详情
 */
export async function getTemplateInfo(args: GetTemplateInfoArgs): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const { name, spaceId, resourceId } = args;
  const templateName = name ?? '';

  if (!name && !resourceId) {
    return createTextToolResult(createMCPErrorResponse({
      code: 'INVALID_NAME',
      message: t('mcp.templates.nameRequired'),
      suggestion: t('mcp.templates.useListHint'),
      category: 'validation',
      retryable: false,
    }));
  }

  const context = getMCPContext();
  let detail: TemplateDetail | null = null;

  if (resourceId) {
    try {
      const resource = await resolveTemplateResourceRef({
        context,
        requestedSpaceId: spaceId,
        resourceId,
      });
      const preparedContext = resource.source === 'cloud'
        ? await prepareMCPCloudContext()
        : context;
      detail = await getTemplateInfoByResourceRef(preparedContext, resource);
    } catch (error) {
      if (error instanceof MCPTemplateResolutionError) {
        return createTextToolResult(createMCPErrorResponse(error.mcpError));
      }

      return createTextToolResult(createMCPErrorResponse(mapMCPError(error, {
        code: 'CLOUD_INFO_PREPARE_FAILED',
        message: t('mcp.templates.cloudInfoPrepareFailed'),
        suggestion: t('mcp.templates.retrySuggestion'),
        category: 'system',
        retryable: true,
      })));
    }
  } else if (context.isLocalSpace) {
    detail = await getLocalTemplateInfo(templateName);
  } else if (supportsCloudResources(context)) {
    try {
      const cloudContext = await prepareMCPCloudContext();
      detail = await getCloudTemplateInfo(cloudContext, templateName);
    } catch (error) {
      return createTextToolResult(createMCPErrorResponse(mapMCPError(error, {
        code: 'CLOUD_INFO_PREPARE_FAILED',
        message: t('mcp.templates.cloudInfoPrepareFailed'),
        suggestion: t('mcp.templates.retrySuggestion'),
        category: 'system',
        retryable: true,
      })));
    }
  } else {
    detail = await getLocalTemplateInfo(templateName);
  }

  if (!detail) {
    return createTextToolResult(createMCPErrorResponse({
      code: 'TEMPLATE_NOT_FOUND',
      message: t('mcp.templates.notFound', { name }),
      suggestion: t('mcp.templates.useListOrSearchHint'),
      category: 'resource',
      retryable: false,
    }));
  }

  return createTextToolResult(createMCPSuccessResponse(detail));
}

/**
 * 从本地数据库获取模板详情
 */
async function getLocalTemplateInfo(name: string): Promise<TemplateDetail | null> {
  const template = await TemplatesDAO.getByName(name);
  if (!template) return null;

  return buildLocalTemplateDetail(template);
}

/**
 * 从资源引用获取模板详情
 */
async function getTemplateInfoByResourceRef(
  context: ReturnType<typeof getMCPContext>,
  resource: TemplateResourceRef
): Promise<TemplateDetail | null> {
  if (resource.source === 'local' || resource.spaceId === LOCAL_SPACE_ID) {
    const template = await TemplatesDAO.getByResourceId(resource.resourceId);
    return template ? buildLocalTemplateDetail(template) : null;
  }

  if (!supportsCloudResources(context)) {
    return null;
  }

  const resolved = await getCloudTemplateDetailById(context, resource.spaceId, resource.resourceId);
  if (!resolved) {
    return null;
  }

  return buildCloudTemplateDetail(resolved.detail, {
    source: 'cloud',
    spaceId: resource.spaceId,
    resourceId: resource.resourceId,
    spaceName: resource.spaceName,
  });
}

/**
 * 构建本地模板详情
 */
function buildLocalTemplateDetail(template: {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  tags: string | null;
  template_type: string;
  clone_count: number;
  last_cloned_at: string | null;
  created_at: string;
  updated_at: string;
  git_url: string;
  branch: string;
  variables: string | null;
}): TemplateDetail {
  const variables = parseJSON<Record<string, any>>(template.variables);
  const hasVariables = !!(variables && Object.keys(variables).length > 0);

  return {
    name: template.name,
    description: template.description,
    category: template.category,
    tags: parseJSON<string[]>(template.tags) || [],
    type: template.template_type,
    usageCount: template.clone_count,
    lastUsedAt: template.last_cloned_at,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
    supportsVariables: hasVariables,
    variables: hasVariables ? { enabled: true } : undefined,
    source: {
      type: 'git',
      gitUrl: template.git_url,
      branch: template.branch,
    },
    resource: {
      source: 'local',
      spaceId: LOCAL_SPACE_ID,
      resourceId: String(template.id),
    },
    usageHint: t('mcp.templates.cloneUsageHint', { name: template.name }),
  };
}

/**
 * 从云端获取模板详情
 */
async function getCloudTemplateInfo(
  context: { spaceId: string; accessToken: string | null },
  name: string
): Promise<TemplateDetail | null> {
  if (!context.accessToken) {
    return getLocalTemplateInfo(name);
  }

  try {
    // 先尝试从本地查找（云端模板可能也在本地有缓存）
    const localDetail = await getLocalTemplateInfo(name);
    if (localDetail) return localDetail;

    const resolved = await getCloudTemplateDetail(context, name);
    if (!resolved) {
      return null;
    }

    return buildCloudTemplateDetail(resolved.detail, {
      source: 'cloud',
      spaceId: resolved.item.spaceId || context.spaceId,
      resourceId: resolved.item.id,
      spaceName: resolved.item.spaceName,
    });
  } catch {
    return getLocalTemplateInfo(name);
  }
}

function buildCloudTemplateDetail(detail: {
  name: string;
  description?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  template?: {
    sourceType?: 'git' | 'upload' | 'editor';
    definition?: {
      source?: {
        type?: 'git' | 'upload' | 'editor';
        git?: { repo?: string; branch?: string };
      };
      variables?: { inquirerQuestions?: Array<{ name: string; type: string; message: string; default?: any }> };
    };
    usageCount?: number;
  };
}, resource: TemplateResourceRef): TemplateDetail {
  const variableQuestions = detail.template?.definition?.variables?.inquirerQuestions;
  const hasVariables = !!(variableQuestions && variableQuestions.length > 0);

  return {
    name: detail.name,
    description: detail.description || null,
    category: null,
    tags: detail.tags || [],
    type: detail.template?.sourceType || detail.template?.definition?.source?.type || 'cloud',
    usageCount: detail.template?.usageCount || 0,
    lastUsedAt: null,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    supportsVariables: hasVariables,
    variables: hasVariables ? { enabled: true, questions: variableQuestions } : undefined,
    source: {
      type: detail.template?.definition?.source?.type || 'upload',
      gitUrl: detail.template?.definition?.source?.git?.repo,
      branch: detail.template?.definition?.source?.git?.branch,
    },
    resource,
    usageHint: t('mcp.templates.cloneUsageHint', { name: detail.name }),
  };
}
