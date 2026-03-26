/**
 * 搜索模板 Tool
 *
 * 按关键词搜索模板
 */

import { getMCPContext, mapMCPError, prepareMCPCloudContext, supportsCloudResources } from '../../context.js';
import { createMCPErrorResponse, createMCPSuccessResponse, createTextToolResult } from '../../shared/index.js';
import { TemplatesDAO } from '../../../db/dao/templates.dao.js';
import { searchCloudTemplates, TemplateResourceRef } from './cloud-template-utils.js';
import { t } from '../../../i18n/index.js';
import { parseJSON } from '../../../shared/utils.js';
import type { CloudResourceListItem, MCPToolResponse } from '../../../shared/types.js';
import { LOCAL_SPACE_ID } from '../../../shared/constants.js';

/**
 * 搜索结果项
 */
export interface SearchResultItem {
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  resource: TemplateResourceRef;
  /** 匹配度分数（越高越相关） */
  score: number;
  /** 匹配原因 */
  matchReason: string;
}

/**
 * searchTemplates 返回结果
 */
export interface SearchTemplatesResult {
  query: string;
  total: number;
  results: SearchResultItem[];
  hint: string;
}

/**
 * searchTemplates 参数
 */
export interface SearchTemplatesArgs {
  /** 搜索关键词（必需） */
  query: string;
  /** 限制返回数量 */
  limit?: number;
}

/**
 * 搜索模板
 */
export async function searchTemplates(args: SearchTemplatesArgs): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const { query, limit = 10 } = args;

  if (!query || query.trim().length === 0) {
    return createTextToolResult(createMCPErrorResponse({
      code: 'INVALID_QUERY',
      message: t('mcp.templates.queryRequired'),
      suggestion: t('mcp.templates.querySuggestion'),
      category: 'validation',
      retryable: false,
    }));
  }

  const context = getMCPContext();
  const keyword = query.trim().toLowerCase();

  if (context.isLocalSpace || !supportsCloudResources(context)) {
    return searchLocalTemplates(query, keyword, limit);
  }

  try {
    const cloudContext = await prepareMCPCloudContext();
    return searchRemoteTemplates(cloudContext, query, keyword, limit);
  } catch (error) {
    return createTextToolResult(createMCPErrorResponse(mapMCPError(error, {
      code: 'CLOUD_SEARCH_PREPARE_FAILED',
      message: t('mcp.templates.cloudSearchPrepareFailed'),
      suggestion: t('mcp.templates.retrySuggestion'),
      category: 'system',
      retryable: true,
    })));
  }
}

async function searchLocalTemplates(
  query: string,
  keyword: string,
  limit: number
): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const allTemplates = await TemplatesDAO.getAll();
  const results: SearchResultItem[] = [];

  for (const t of allTemplates) {
    let score = 0;
    const matchReasons: string[] = [];

    if (t.name.toLowerCase().includes(keyword)) {
      score += 100;
      matchReasons.push('name');
    }

    if (t.description?.toLowerCase().includes(keyword)) {
      score += 50;
      matchReasons.push('description');
    }

    const tags = parseJSON<string[]>(t.tags) || [];
    if (tags.some((tag) => tag.toLowerCase().includes(keyword))) {
      score += 80;
      matchReasons.push('tags');
    }

    if (t.category?.toLowerCase().includes(keyword)) {
      score += 60;
      matchReasons.push('category');
    }

    if (score > 0) {
      results.push({
        name: t.name,
        description: t.description,
        category: t.category,
        tags,
        resource: {
          source: 'local',
          spaceId: LOCAL_SPACE_ID,
          resourceId: String(t.id),
        },
        score,
        matchReason: matchReasons.join(', '),
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const limitedResults = results.slice(0, limit);

  return createTextToolResult(createMCPSuccessResponse({
    query,
    total: limitedResults.length,
    results: limitedResults,
    hint: limitedResults.length > 0
      ? t('mcp.templates.searchDetailHint')
      : t('mcp.templates.searchEmptyHint'),
  }));
}

type SearchTemplateCandidate = {
  name: string;
  description: string | null;
  tags: string[];
  category: string | null;
  resource: TemplateResourceRef;
};

function mergeTemplateCandidates(
  localTemplates: SearchTemplateCandidate[],
  cloudTemplates: CloudResourceListItem[]
): SearchTemplateCandidate[] {
  const merged = new Map<string, SearchTemplateCandidate>();

  for (const template of cloudTemplates) {
    merged.set(template.name.trim().toLowerCase(), {
      name: template.name,
      description: template.description ?? null,
      tags: template.tags || [],
      category: null,
      resource: {
        source: 'cloud',
        spaceId: template.spaceId,
        resourceId: template.id,
        spaceName: template.spaceName,
      },
    });
  }

  for (const template of localTemplates) {
    const key = template.name.trim().toLowerCase();
    if (!merged.has(key)) {
      merged.set(key, template);
    }
  }

  return Array.from(merged.values());
}

async function searchRemoteTemplates(
  context: { spaceId: string; accessToken: string | null },
  query: string,
  keyword: string,
  limit: number
): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const localTemplateRecords = await TemplatesDAO.getAll();
  const localTemplates = localTemplateRecords.map((template) => ({
    name: template.name,
    description: template.description,
    tags: parseJSON<string[]>(template.tags) || [],
    category: template.category,
    resource: {
      source: 'local' as const,
      spaceId: LOCAL_SPACE_ID,
      resourceId: String(template.id),
    },
  }));
  const cloudTemplates = await searchCloudTemplates(context, query, Math.max(limit, 20));
  const templates = mergeTemplateCandidates(localTemplates, cloudTemplates);
  const results: SearchResultItem[] = [];

  for (const t of templates) {
    let score = 0;
    const matchReasons: string[] = [];

    if (t.name.toLowerCase().includes(keyword)) {
      score += 100;
      matchReasons.push('name');
    }

    if (t.description?.toLowerCase().includes(keyword)) {
      score += 50;
      matchReasons.push('description');
    }

    const tags = t.tags || [];
    if (tags.some((tag) => tag.toLowerCase().includes(keyword))) {
      score += 80;
      matchReasons.push('tags');
    }

    if (score > 0) {
      results.push({
        name: t.name,
        description: t.description ?? null,
        category: t.category,
        tags,
        resource: t.resource,
        score,
        matchReason: matchReasons.join(', '),
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const limitedResults = results.slice(0, limit);

  return createTextToolResult(createMCPSuccessResponse({
    query,
    total: limitedResults.length,
    results: limitedResults,
    hint: limitedResults.length > 0
      ? t('mcp.templates.searchDetailHint')
      : t('mcp.templates.searchEmptyHint'),
  }));
}
