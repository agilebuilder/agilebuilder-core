/**
 * 基于模板创建项目 Tool
 *
 * 从模板创建新项目
 */

import { existsSync, readdirSync } from 'fs';
import { isAbsolute, basename } from 'path';
import { createMCPErrorResponse, createMCPSuccessResponse, createTextToolResult } from '../../shared/index.js';
import { getMCPContext } from '../../context.js';
import { TemplatesDAO } from '../../../db/dao/templates.dao.js';
import { ProcessorFactory } from '../../../core/processor-factory.js';
import { cloudDetailToTemplate, getCloudTemplateDetailById, TemplateResourceRef } from './cloud-template-utils.js';
import { t } from '../../../i18n/index.js';
import type { MCPToolResponse, Template } from '../../../shared/types.js';
import { LOCAL_SPACE_ID } from '../../../shared/constants.js';
import {
  MCPTemplateResolutionError,
  resolveTemplateResourceRef,
} from './template-resource-resolver.js';

/**
 * 克隆结果
 */
export interface CloneResult {
  /** 项目路径 */
  path: string;
  /** 项目名称 */
  projectName: string;
  /** 使用的模板 */
  templateName: string;
  /** 处理器类型 */
  processorType: 'basic' | 'pro';
  /** 是否处理了变量 */
  variablesProcessed: boolean;
  /** 后续步骤建议 */
  nextSteps: string[];
}

/**
 * createProjectByTemplate 参数
 */
export interface CreateProjectByTemplateArgs {
  /** 模板名称（展示用途，可选） */
  templateName?: string;
  /** 空间 ID（可选，优先使用；未传时默认当前空间） */
  spaceId?: string;
  /** 资源 ID（必需，精准定位资源） */
  resourceId: string;
  /** 目标路径（必需，绝对路径） */
  targetPath: string;
  /** 项目名称（可选） */
  projectName?: string;
  /** 变量值（可选，Pro 功能） */
  variables?: Record<string, any>;
}

/**
 * 基于模板创建项目
 */
export async function cloneTemplate(args: CreateProjectByTemplateArgs): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const { templateName, targetPath, projectName, variables, spaceId, resourceId } = args;

  // 参数验证
  const validation = validateArgs(resourceId, targetPath);
  if (!validation.valid) {
    return createTextToolResult(validation.error);
  }

  const context = getMCPContext();

  let resourceRef: TemplateResourceRef;
  try {
    resourceRef = await resolveTemplateResourceRef({
      context,
      requestedSpaceId: spaceId,
      resourceId,
    });
  } catch (error) {
    if (error instanceof MCPTemplateResolutionError) {
      return createTextToolResult(createMCPErrorResponse(error.mcpError));
    }

    return createTextToolResult(createMCPErrorResponse({
      code: 'TEMPLATE_RESOLUTION_FAILED',
      message: error instanceof Error ? error.message : t('mcp.templates.notFound', { name: templateName || resourceId }),
      suggestion: t('mcp.templates.useListHint'),
      category: 'resource',
      retryable: false,
      metadata: { phase: 'resolve-template-resource', resourceId, requestedSpaceId: spaceId },
    }));
  }

  const cloudExecution = resourceRef.source === 'cloud'
    ? await ProcessorFactory.prepareCloudProcessor()
    : null;

  const template = await resolveTemplate(resourceRef, cloudExecution?.token || null);
  if (!template) {
    return createTextToolResult(createMCPErrorResponse({
      code: 'TEMPLATE_NOT_FOUND',
      message: t('mcp.templates.notFound', { name: templateName || resourceId }),
      suggestion: t('mcp.templates.useListHint'),
      category: 'resource',
      retryable: false,
    }));
  }

  try {
    const processor = resourceRef.source === 'local'
      ? ProcessorFactory.getProcessorByType('basic')
      : cloudExecution!.processor;
    const useVariables = resourceRef.source === 'cloud' && !!variables && Object.keys(variables).length > 0;

    // 执行克隆
    const result = await processor.clone({
      template,
      targetPath,
      variables: useVariables ? variables : undefined,
      skipGitHistory: true,
    });

    if (!result.success) {
      return createTextToolResult(createMCPErrorResponse({
        code: 'CLONE_FAILED',
        message: result.error || t('mcp.templates.cloneFailed'),
        suggestion: t('mcp.templates.cloneRetryHint'),
        category: 'system',
        retryable: true,
      }));
    }

    // 更新使用计数
    if (resourceRef.source === 'local') {
      await TemplatesDAO.incrementCloneCount(template.name);
    }

    // 构建后续步骤建议
    const nextSteps = buildNextSteps(targetPath, template);

    return createTextToolResult(createMCPSuccessResponse({
      path: targetPath,
      projectName: projectName || basename(targetPath),
      templateName: templateName || template.name,
      processorType: result.processorType,
      variablesProcessed: !!(useVariables && result.processorType === 'pro'),
      nextSteps,
    }));
  } catch (error) {
    return createTextToolResult(createMCPErrorResponse({
      code: 'CLONE_ERROR',
      message: error instanceof Error ? error.message : t('common.unknownError'),
      suggestion: t('mcp.templates.cloneErrorRetryHint'),
      category: 'system',
      retryable: true,
    }));
  }
}

/**
 * 验证参数
 */
function validateArgs(
  resourceId: string | undefined,
  targetPath: string | undefined
): { valid: true } | { valid: false; error: MCPToolResponse } {
  if (!resourceId) {
    return {
      valid: false,
      error: {
        success: false,
        error: {
          code: 'MISSING_RESOURCE_ID',
          message: t('mcp.templates.resourceIdRequired'),
          suggestion: t('mcp.templates.resourceIdSuggestion'),
          category: 'validation',
          retryable: false,
        },
      },
    };
  }

  if (!targetPath) {
    return {
      valid: false,
      error: {
        success: false,
        error: {
          code: 'MISSING_PATH',
          message: t('mcp.templates.targetPathRequired'),
          suggestion: t('mcp.templates.absolutePathSuggestion'),
          category: 'validation',
          retryable: false,
        },
      },
    };
  }

  if (!isAbsolute(targetPath)) {
    return {
      valid: false,
      error: {
        success: false,
        error: {
          code: 'INVALID_PATH',
          message: t('mcp.templates.absolutePathRequired'),
          suggestion: t('mcp.templates.absolutePathExample', { name: basename(targetPath) }),
          category: 'validation',
          retryable: false,
        },
      },
    };
  }

  if (existsSync(targetPath)) {
    try {
      const files = readdirSync(targetPath);
      if (files.length > 0) {
        return {
          valid: false,
          error: {
            success: false,
            error: {
              code: 'PATH_NOT_EMPTY',
              message: t('mcp.templates.targetNotEmpty'),
              suggestion: t('mcp.templates.chooseEmptyDirectory'),
              category: 'validation',
              retryable: false,
            },
          },
        };
      }
    } catch {
      // 忽略读取错误
    }
  }

  return { valid: true };
}

async function resolveTemplate(
  resource: TemplateResourceRef,
  cloudToken: string | null
): Promise<Template | null> {
  if (resource.source === 'local' || resource.spaceId === LOCAL_SPACE_ID) {
    return await TemplatesDAO.getByResourceId(resource.resourceId);
  }

  if (!cloudToken) {
    return null;
  }

  const resolved = await getCloudTemplateDetailById(
    {
      spaceId: resource.spaceId,
      accessToken: cloudToken,
    },
    resource.spaceId,
    resource.resourceId
  );
  if (!resolved) {
    return null;
  }
  return cloudDetailToTemplate(resolved.detail, resolved.item.name);

}

/**
 * 构建后续步骤建议
 */
function buildNextSteps(targetPath: string, template: Template): string[] {
  const steps: string[] = [];

  steps.push(`cd "${targetPath}"`);

  // 根据模板类型推断后续步骤
  const name = template.name.toLowerCase();
  const tags = template.tags?.toLowerCase() || '';

  if (name.includes('node') || tags.includes('node') || tags.includes('npm')) {
    steps.push('npm install');
    steps.push('npm run dev');
  } else if (name.includes('vue') || tags.includes('vue')) {
    steps.push('npm install');
    steps.push('npm run dev');
  } else if (name.includes('react') || tags.includes('react')) {
    steps.push('npm install');
    steps.push('npm start');
  } else if (name.includes('python') || tags.includes('python')) {
    steps.push('pip install -r requirements.txt');
    steps.push('python main.py');
  } else {
    steps.push('# Check README.md for setup instructions');
  }

  return steps;
}
