/**
 * 列出模板 Tool
 *
 * 列出当前空间下所有可用的项目模板
 */

import { getMCPContext, mapMCPError, prepareMCPCloudContext, supportsCloudResources } from '../../context.js';
import { createMCPErrorResponse, createMCPSuccessResponse, createTextToolResult } from '../../shared/index.js';
import { TemplatesDAO } from '../../../db/dao/templates.dao.js';
import { searchCloudTemplates, TemplateResourceRef } from './cloud-template-utils.js';
import { t } from '../../../i18n/index.js';
import { parseJSON } from '../../../shared/utils.js';
import type { MCPToolResponse } from '../../../shared/types.js';
import { LOCAL_SPACE_ID } from '../../../shared/constants.js';

/**
 * 模板列表项（AI 友好格式）
 */
export interface TemplateListItem {
  /** 模板名称（唯一标识） */
  name: string;
  /** 模板描述 */
  description: string | null;
  /** 分类 */
  category: string | null;
  /** 标签列表 */
  tags: string[];
  /** 使用次数（越高表示越受欢迎） */
  usageCount: number;
  /** 精准资源定位信息 */
  resource: TemplateResourceRef;
  /** 适用场景描述 */
  useCases?: string[];
}

/**
 * listTemplates 返回结果
 */
export interface ListTemplatesResult {
  /** 当前空间名称 */
  spaceName: string;
  /** 是否为本地空间 */
  isLocalSpace: boolean;
  /** 模板总数 */
  total: number;
  /** 模板列表 */
  templates: TemplateListItem[];
  /** 可用分类列表 */
  categories: string[];
  /** 使用提示 */
  hint: string;
}

/**
 * listTemplates 参数
 */
export interface ListTemplatesArgs {
  /** 按分类过滤 */
  category?: string;
  /** 按标签过滤（多个标签用逗号分隔） */
  tags?: string;
  /** 限制返回数量 */
  limit?: number;
}

/**
 * 列出模板
 */
export async function listTemplates(args: ListTemplatesArgs = {}): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const context = getMCPContext();
  const { category, tags, limit } = args;

  // 本地空间：从本地数据库读取
  if (context.isLocalSpace) {
    const result = await listLocalTemplates(context.spaceName, category, tags, limit);
    return createTextToolResult(createMCPSuccessResponse(result));
  }

  // 云端空间：从云端 API 读取
  if (supportsCloudResources(context)) {
    let cloudResult: CloudTemplatesResult;

    try {
      const cloudContext = await prepareMCPCloudContext();
      cloudResult = await listCloudTemplates(cloudContext, category, tags, limit);
    } catch (error) {
      return createTextToolResult(createMCPErrorResponse(mapMCPError(error, {
        code: 'CLOUD_LIST_PREPARE_FAILED',
        message: t('mcp.templates.cloudListPrepareFailed'),
        suggestion: t('mcp.templates.retrySuggestion'),
        category: 'system',
        retryable: true,
      })));
    }

    if (cloudResult.success) {
      return createTextToolResult(createMCPSuccessResponse(cloudResult.data));
    } else {
      return createTextToolResult(createMCPErrorResponse(cloudResult.error));
    }
  }

  // 未登录或不支持云端资源，返回错误
  return createTextToolResult(createMCPErrorResponse({
    code: 'CLOUD_NOT_SUPPORTED',
    message: t('mcp.templates.cloudUnsupported'),
    suggestion: t('mcp.templates.loginAndSelectCloud'),
  }));
}

/**
 * 从本地数据库列出模板
 */
async function listLocalTemplates(
  spaceName: string,
  category?: string,
  tags?: string,
  limit?: number
): Promise<ListTemplatesResult> {
  let templates = category
    ? await TemplatesDAO.getByCategory(category)
    : await TemplatesDAO.getAll();

  // 按标签过滤
  if (tags) {
    const tagList = tags.split(',').map((t) => t.trim().toLowerCase());
    templates = templates.filter((t) => {
      const templateTags = parseJSON<string[]>(t.tags) || [];
      return tagList.some((tag) =>
        templateTags.some((tt) => tt.toLowerCase().includes(tag))
      );
    });
  }

  // 按使用次数排序
  templates.sort((a, b) => b.clone_count - a.clone_count);

  // 限制数量
  if (limit && limit > 0) {
    templates = templates.slice(0, limit);
  }

  // 收集所有分类
  const allTemplates = await TemplatesDAO.getAll();
  const categories = [...new Set(allTemplates.map((t) => t.category).filter(Boolean))] as string[];

  const items: TemplateListItem[] = templates.map((t) => ({
    name: t.name,
    description: t.description,
    category: t.category,
    tags: parseJSON<string[]>(t.tags) || [],
    usageCount: t.clone_count,
    resource: {
      source: 'local',
      spaceId: LOCAL_SPACE_ID,
      resourceId: String(t.id),
    },
  }));

  return {
    spaceName,
    isLocalSpace: true,
    total: items.length,
    templates: items,
    categories,
    hint: t('mcp.templates.hint'),
  };
}

/**
 * 云端模板列表结果（可能包含错误）
 */
type CloudTemplatesResult =
  | { success: true; data: ListTemplatesResult }
  | { success: false; error: NonNullable<MCPToolResponse['error']> };

/**
 * 从云端 API 列出模板
 */
async function listCloudTemplates(
  context: { spaceId: string; spaceName: string; accessToken: string | null },
  category?: string,
  tags?: string,
  limit?: number
): Promise<CloudTemplatesResult> {
  if (!context.accessToken) {
    return {
      success: false,
      error: {
        code: 'NO_ACCESS_TOKEN',
        message: t('mcp.templates.noAccessToken'),
        suggestion: t('mcp.auth.reloginSuggestion'),
        category: 'auth',
        retryable: false,
      },
    };
  }

  try {
    const localTemplates = await TemplatesDAO.getAll();
    const localItems: TemplateListItem[] = localTemplates.map((template) => ({
      name: template.name,
      description: template.description,
      category: template.category,
      tags: parseJSON<string[]>(template.tags) || [],
      usageCount: template.clone_count,
      resource: {
        source: 'local',
        spaceId: LOCAL_SPACE_ID,
        resourceId: String(template.id),
      },
    }));

    const cloudItems: TemplateListItem[] = (await searchCloudTemplates(
      context,
      '',
      Math.max(limit || 20, 100)
    )).map((template) => ({
      name: template.name,
      description: template.description ?? null,
      category: null,
      tags: template.tags || [],
      usageCount: 0,
      resource: {
        source: 'cloud',
        spaceId: template.spaceId,
        resourceId: template.id,
        spaceName: template.spaceName,
      },
    }));

    let items = mergeTemplateListItems(localItems, cloudItems);

    if (tags) {
      const tagList = tags.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean);
      items = items.filter(item =>
        tagList.some(tag => item.tags.some(templateTag => templateTag.toLowerCase().includes(tag)))
      );
    }

    if (category) {
      items = items.filter(item => item.category === category);
    }

    if (limit && limit > 0) {
      items = items.slice(0, limit);
    }

    // 收集分类
    const categories = [...new Set(items.map((t) => t.category).filter(Boolean))] as string[];

    return {
      success: true,
      data: {
        spaceName: context.spaceName,
        isLocalSpace: false,
        total: items.length,
        templates: items,
        categories,
        hint: t('mcp.templates.hint'),
      },
    };
  } catch (error) {
    const mappedError = mapMCPError(error, {
      code: 'CLOUD_API_ERROR',
      message: t('mcp.templates.cloudListPrepareFailed'),
      suggestion: t('mcp.templates.retrySuggestion'),
      category: 'network',
      retryable: true,
    });

    return {
      success: false,
      error: mappedError || {
        code: 'CLOUD_API_ERROR',
        message: t('mcp.templates.cloudListPrepareFailed'),
        suggestion: t('mcp.templates.retrySuggestion'),
        category: 'network',
        retryable: true,
      },
    };
  }
}

function mergeTemplateListItems(
  localItems: TemplateListItem[],
  cloudItems: TemplateListItem[]
): TemplateListItem[] {
  const merged = new Map<string, TemplateListItem>();

  for (const item of cloudItems) {
    merged.set(item.name.trim().toLowerCase(), item);
  }

  for (const item of localItems) {
    const key = item.name.trim().toLowerCase();
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.usageCount - a.usageCount);
}
