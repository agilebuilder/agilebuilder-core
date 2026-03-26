/**
 * 文档资源处理
 *
 * 将文档映射为 MCP Resources
 * URI 结构设计：
 *   - agilebuilder://usage/agent-policy   (优先级 1: AI 行为策略 - 必读)
 *   - agilebuilder://usage/guide          (优先级 1: 操作指南 - 必读)
 *   - agilebuilder://docs/catalog         (优先级 2: 文档目录)
 *   - agilebuilder://docs/local/{id}      (优先级 3: 本地用户文档)
 *   - agilebuilder://docs/user/{id}       (优先级 3: 云端用户文档)
 */

import { getMCPContext, mapMCPError, prepareMCPCloudContext, supportsCloudResources } from '../context.js';
import { getCloudResourceDetailById } from '../shared/index.js';
import { ResourcesDAO } from '../../db/dao/resources.dao.js';
import { ResourceApi } from '../../resource/api.js';
import { t } from '../../i18n/index.js';
import type { MCPToolResponse, WorkspaceTreeNode } from '../../shared/types.js';

/**
 * MCP Resource 定义
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
}

export interface DocResourceReadResult {
  uri: string;
  mimeType: string;
  text: string;
}

export interface DocResourceReadError {
  code: string;
  message: string;
  suggestion?: string;
  category?: NonNullable<MCPToolResponse['error']>['category'];
  retryable?: boolean;
  metadata?: Record<string, any>;
}

export interface DocResourceListResult {
  resources: MCPResource[];
  warnings: DocResourceReadError[];
}

/**
 * 文档优先级
 */
export enum DocPriority {
  SYSTEM_GUIDE = 1,
  SYSTEM_CATALOG = 2,
  USER_DOC = 3,
}

/**
 * URI 前缀常量
 */
export const USAGE_URI_PREFIX = 'agilebuilder://usage';
export const DOCS_URI_PREFIX = 'agilebuilder://docs';
export const AGENT_POLICY_URI = `${USAGE_URI_PREFIX}/agent-policy`;
export const USAGE_GUIDE_URI = `${USAGE_URI_PREFIX}/guide`;
export const DOCS_CATALOG_URI = `${DOCS_URI_PREFIX}/catalog`;
export const LOCAL_DOC_URI_PREFIX = `${DOCS_URI_PREFIX}/local`;
export const CLOUD_DOC_URI_PREFIX = `${DOCS_URI_PREFIX}/cloud`;

/**
 * 获取所有可用的文档资源列表
 */
export async function listDocResources(): Promise<DocResourceListResult> {
  const resources: MCPResource[] = [];
  const warnings: DocResourceReadError[] = [];

  // 1. 系统内置资源（始终存在）
  resources.push({
    uri: AGENT_POLICY_URI,
    name: 'AgileBuilder Agent Policy',
    description: '[PRIORITY: HIGH] Mandatory AI operating policy. Read this FIRST. It defines when template tools must be used and when project documents must be read before coding.',
    mimeType: 'text/markdown',
  });

  resources.push({
    uri: USAGE_GUIDE_URI,
    name: 'AgileBuilder Usage Guide',
    description: '[PRIORITY: HIGH] Tool usage guide for AgileBuilder MCP. Read after Agent Policy when you need workflow details, tool selection guidance, and template creation steps.',
    mimeType: 'text/markdown',
  });

  resources.push({
    uri: DOCS_CATALOG_URI,
    name: 'Document Catalog',
    description: '[PRIORITY: HIGH] Index of all available documents in the current space. Use this to identify coding standards, architecture rules, stack requirements, and other constraints that must be followed before making changes.',
    mimeType: 'text/markdown',
  });

  const context = getMCPContext();
  // 2. 本地用户文档（从当前空间获取）
  if (context.isLocalSpace) {
    const localDocs = await fetchLocalDocuments();
    resources.push(...localDocs);
  }

  // 3. 云端用户文档（从当前空间获取）
  if (supportsCloudResources(context)) {
    try {
      const cloudContext = await prepareMCPCloudContext();
      const userDocs = await fetchUserDocuments(cloudContext);
      resources.push(...userDocs);
    } catch (error) {
      const mappedError = mapMCPError(error, {
        code: 'DOC_CLOUD_LIST_FAILED',
        message: t('mcp.docs.cloudListFailed'),
        suggestion: t('mcp.docs.retrySuggestion'),
        category: 'system',
        retryable: true,
        metadata: { phase: 'list-doc-resources', source: 'cloud' },
      });
      const warning: DocResourceReadError = {
        code: mappedError?.code || 'DOC_CLOUD_LIST_FAILED',
        message: mappedError?.message || t('mcp.docs.cloudListFailed'),
        suggestion: mappedError?.suggestion,
        category: mappedError?.category,
        retryable: mappedError?.retryable,
        metadata: {
          phase: 'list-doc-resources',
          source: 'cloud',
        },
      };
      warnings.push(warning);
    }
  }

  return {
    resources,
    warnings,
  };
}

/**
 * 从本地数据库获取用户文档列表
 */
async function fetchLocalDocuments(): Promise<MCPResource[]> {
  const docs: MCPResource[] = [];
  for (const resource of await ResourcesDAO.getAll()) {
    if (resource.type !== 'doc') {
      continue;
    }
    const doc = await ResourcesDAO.getDocById(resource.id);
    if (!doc) {
      continue;
    }
    docs.push({
      uri: `${LOCAL_DOC_URI_PREFIX}/${doc.id}`,
      name: doc.name,
      description: `[PRIORITY: HIGH] Project document: ${doc.name}. Read this when the task involves coding, refactoring, architecture, standards, stack selection, or delivery rules. Original URI: ${doc.uri}`,
      mimeType: 'text/markdown',
    });
  }
  return docs;
}

/**
 * 从云端获取用户文档列表
 */
async function fetchUserDocuments(
  context: { spaceId: string; accessToken: string }
): Promise<MCPResource[]> {
  const treeResult = await ResourceApi.getTree(
    context.spaceId,
    null,
    context.accessToken
  );

  if (!treeResult.success || !treeResult.data) {
    throw new Error(treeResult.error || t('mcp.docs.cloudTreeFailed'));
  }

  return await collectDocuments(
    context.spaceId,
    context.accessToken,
    treeResult.data.items
  );
}

/**
 * 递归收集文档资源
 */
async function collectDocuments(
  spaceId: string,
  token: string,
  nodes: WorkspaceTreeNode[]
): Promise<MCPResource[]> {
  const docs: MCPResource[] = [];

  for (const node of nodes) {
    if (node.type === 'resource' && node.resourceType === 'doc' && node.resourceId) {
      docs.push({
        uri: `${CLOUD_DOC_URI_PREFIX}/${spaceId}/${node.resourceId}`,
        name: node.name,
        description: `[PRIORITY: HIGH] Project document: ${node.name}. Read this before coding or modifying files if it may contain project-specific standards, architecture rules, technical stack requirements, or delivery constraints.`,
        mimeType: 'text/markdown',
      });
    } else if (node.type === 'folder' && node.hasChildren) {
      const childResult = await ResourceApi.getNodeChildren(spaceId, node.id, token);
      if (!childResult.success || !childResult.data) {
        throw new Error(childResult.error || t('mcp.docs.readFolderFailed', { name: node.name }));
      }
      const childDocs = await collectDocuments(spaceId, token, childResult.data.items);
      docs.push(...childDocs);
    }
  }

  return docs;
}

/**
 * 读取文档内容
 */
export async function readDocResource(uri: string): Promise<
  | { success: true; content: DocResourceReadResult }
  | { success: false; error: DocResourceReadError }
> {
  // AI 行为策略
  if (uri === AGENT_POLICY_URI) {
    return {
      success: true,
      content: {
        uri,
        mimeType: 'text/markdown',
        text: getAgentPolicyContent(),
      },
    };
  }

  // 系统操作指南
  if (uri === USAGE_GUIDE_URI) {
    return {
      success: true,
      content: {
        uri,
        mimeType: 'text/markdown',
        text: getUsageGuideContent(),
      },
    };
  }

  // 文档目录
  if (uri === DOCS_CATALOG_URI) {
    const catalog = await generateDocCatalog();
    return {
      success: true,
      content: {
        uri,
        mimeType: 'text/markdown',
        text: catalog,
      },
    };
  }

  // 本地用户文档
  if (uri.startsWith(LOCAL_DOC_URI_PREFIX)) {
    const docId = Number(uri.replace(`${LOCAL_DOC_URI_PREFIX}/`, ''));
    if (!Number.isNaN(docId)) {
      const doc = await ResourcesDAO.getDocById(docId);
      if (doc) {
        return {
          success: true,
          content: {
            uri,
            mimeType: 'text/markdown',
            text: doc.content,
          },
        };
      }
    }

    return {
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: t('mcp.docs.localNotFound', { uri }),
        suggestion: t('mcp.docs.relistSuggestion'),
        category: 'resource',
        retryable: false,
        metadata: { uri, source: 'local' },
      },
    };
  }

  // 云端用户文档
  if (uri.startsWith(CLOUD_DOC_URI_PREFIX)) {
    const parsed = parseCloudDocUri(uri);
    if (!parsed) {
      return {
        success: false,
        error: {
          code: 'INVALID_RESOURCE_URI',
          message: t('mcp.docs.invalidCloudUri', { uri }),
          suggestion: t('mcp.docs.useOriginalUriSuggestion'),
          category: 'validation',
          retryable: false,
          metadata: { uri },
        },
      };
    }

    try {
      const content = await fetchUserDocContent(parsed.spaceId, parsed.resourceId);
      return {
        success: true,
        content: {
          uri,
          mimeType: 'text/markdown',
          text: content,
        },
      };
    } catch (error) {
      const mappedError = mapMCPError(error, {
        code: 'DOC_CLOUD_READ_FAILED',
        message: t('mcp.docs.cloudReadFailed', { uri }),
        suggestion: t('mcp.docs.cloudReadRetrySuggestion'),
        category: 'network',
        retryable: true,
        metadata: {
          uri,
          source: 'cloud',
          spaceId: parsed.spaceId,
          resourceId: parsed.resourceId,
        },
      });
      const readError: DocResourceReadError = {
        code: mappedError?.code || 'DOC_CLOUD_READ_FAILED',
        message: mappedError?.message || t('mcp.docs.cloudReadFailed', { uri }),
        suggestion: mappedError?.suggestion,
        category: mappedError?.category,
        retryable: mappedError?.retryable,
        metadata: {
          uri,
          source: 'cloud',
          spaceId: parsed.spaceId,
          resourceId: parsed.resourceId,
        },
      };
      return {
        success: false,
        error: readError,
      };
    }
  }

  return {
    success: false,
    error: {
      code: 'RESOURCE_NOT_FOUND',
      message: `Unknown resource: ${uri}`,
      suggestion: t('mcp.docs.unknownResourceSuggestion'),
      category: 'resource',
      retryable: false,
      metadata: { uri },
    },
  };
}

/**
 * 获取 AI 行为策略内容
 */
function getAgentPolicyContent(): string {
  return `# AgileBuilder Agent Policy

## Purpose

This document defines the mandatory operating rules for AI when using AgileBuilder MCP.

## Mandatory Rules

1. **Project creation must prefer template MCP tools**
   - If the user wants to create a new project, prefer AgileBuilder template tools instead of manually creating project scaffolding.
   - Use manual scaffolding only when template MCP cannot satisfy the request.

2. **Coding tasks must read relevant documents first**
   - If the task involves coding, refactoring, debugging, architecture changes, stack selection, naming, or delivery rules, first read relevant project documents from MCP resources.
   - Implementation should follow the constraints defined in those documents.

3. **Prefer exact resource references**
   - When template tools return \`resource.resourceId\`, prefer it over template name in follow-up calls.

4. **Do not treat project documents as optional context**
   - If relevant documents are available, skipping them and coding directly is not the preferred workflow.

## Recommended Execution Order

### For project creation

1. Read this policy
2. Use template discovery tools
3. Prefer \`resource.resourceId\`
4. Create the project with template MCP tools

### For coding or modification

1. Read this policy
2. Inspect document catalog and available resources
3. Read relevant project documents
4. Implement changes while following those documents

## Notes

- Agent Policy defines **behavior requirements**.
- Usage Guide explains **tool usage details**.
- Document Catalog helps you find **project-specific documents**.
`;
}

/**
 * 获取操作指南内容
 */
function getUsageGuideContent(): string {
  return `# AgileBuilder Usage Guide

## Overview

Read \`agilebuilder://usage/agent-policy\` first for mandatory behavior rules. This guide focuses on tool usage details.

AgileBuilder MCP has two equally important responsibilities:

1. Use template tools to create projects from templates.
2. Use document resources to learn project-specific rules before coding and to follow those rules during implementation.

You should treat these responsibilities as mandatory operating requirements:

- If the user wants to create a new project, prefer AgileBuilder template MCP tools instead of creating the project structure manually.
- If the task involves coding, refactoring, debugging, architecture changes, or implementation details, first identify and read relevant doc resources, then follow those documents while working.
- When template tools return precise resource references, prefer \`resource.resourceId\` over template names for follow-up calls.

## Available Tools

### 1. listTemplates(options?)
Browse all available project templates.
- \`category\`: Filter by category (e.g., "frontend", "backend")
- \`tags\`: Filter by tags, comma-separated (e.g., "vue,typescript")
- \`limit\`: Limit number of results

**Use when:** The user wants to create a project, compare available templates, or find a starting point for project creation.

**Important:** Use the returned \`resource.resourceId\` for exact follow-up actions whenever available.

### 2. searchTemplates(query)
Search templates by keyword.
- \`query\`: Search keyword (required)
- \`limit\`: Maximum results (default: 10)

**Use when:** The user mentions a technology, framework, business type, or project style and you need to find matching templates.

**Important:** After searching, prefer the returned \`resource.resourceId\` instead of relying on template names alone.

### 3. getTemplateInfo(name?, resourceId?)
Get detailed information about a specific template.
- \`resourceId\`: Preferred when available for exact lookup
- \`name\`: Optional fallback when \`resourceId\` is unavailable

**Use when:** You need exact template details, supported variables, source information, or a safe handoff before creating the project.

### 4. createProjectByTemplate(resourceId, targetPath, options?)
Create a new project from a template.
- \`resourceId\`: Required for exact template selection
- \`targetPath\`: Absolute path for the project (required)
- \`projectName\`: Custom project name (optional)
- \`variables\`: Variable values for Pro users (optional)

**Use when:** The user is ready to create a project.

**Mandatory preference:** If AgileBuilder template MCP can satisfy project creation, use it instead of manually scaffolding the project.

### 5. Document resources
Read document resources from the MCP resource list, especially project documents in the current workspace.

**Use when:** The task involves coding, modifying files, refactoring, debugging, architecture decisions, stack choices, or delivery constraints.

**Mandatory preference:** Before implementing code changes, read relevant documents such as coding standards, architecture rules, stack requirements, naming rules, or delivery requirements when they are available.

## Recommended Workflow

### For project creation tasks

1. **Find Templates**: Call \`listTemplates()\` or \`searchTemplates(query)\`
2. **Lock Exact Resource**: Use the returned \`resource.resourceId\`
3. **Review Details**: Call \`getTemplateInfo({ resourceId })\`
4. **Create Project**: Call \`createProjectByTemplate({ resourceId, targetPath, variables? })\`
5. **Follow Next Steps**: Use the returned \`nextSteps\` only after creation succeeds

### For coding or modification tasks

1. **List Documents**: Inspect the available MCP resources and the document catalog
2. **Read Relevant Docs**: Prioritize documents about coding standards, architecture, stack requirements, naming rules, and delivery constraints
3. **Implement While Following Docs**: Make changes only after understanding the relevant guidance
4. **Use Template Info If Needed**: If the task also involves creating a project or understanding template capabilities, use the template tools as above

## Tips

- Always use absolute paths for targetPath
- Prefer \`resourceId\` over template name whenever available
- Check template variables before creating (Pro feature)
- Follow the returned \`nextSteps\` after project creation
- For coding tasks, do not skip relevant project documents if they are available in MCP resources
`;
}

/**
 * 生成文档目录
 */
async function generateDocCatalog(): Promise<string> {
  const context = getMCPContext();
  const { resources: docs, warnings } = await listDocResources();

  let catalog = `# Document Catalog

## Current Space: ${context.spaceName}

This catalog contains documents that may define requirements the AI must follow while coding, refactoring, or making technical decisions.

### System Documents (Read First)

| Document | Description |
|----------|-------------|
| [Agent Policy](${AGENT_POLICY_URI}) | Mandatory behavior rules for when to use template tools and when to read project documents |
| [Usage Guide](${USAGE_GUIDE_URI}) | Tool usage details, workflow guidance, and template creation instructions |

### User Documents

`;

  const userDocs = docs.filter(
    d => d.uri.startsWith(LOCAL_DOC_URI_PREFIX) || d.uri.startsWith(CLOUD_DOC_URI_PREFIX)
  );
  if (userDocs.length === 0) {
    catalog += '_No user documents in this space._\n';
  } else {
    catalog += 'Read relevant user documents before coding when they may contain project-specific constraints.\n\n';
    catalog += '| Document | URI |\n|----------|-----|\n';
    for (const doc of userDocs) {
      catalog += `| ${doc.name} | ${doc.uri} |\n`;
    }
  }

  if (warnings.length > 0) {
    catalog += '\n### Warnings\n\n';
    for (const warning of warnings) {
      catalog += `- [${warning.code}] ${warning.message}\n`;
    }
  }

  return catalog;
}

/**
 * 获取用户文档内容
 */
function parseCloudDocUri(uri: string): { spaceId: string; resourceId: string } | null {
  const match = uri.match(/^agilebuilder:\/\/docs\/cloud\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return null;
  }

  return {
    spaceId: decodeURIComponent(match[1]),
    resourceId: decodeURIComponent(match[2]),
  };
}

async function fetchUserDocContent(spaceId: string, resourceId: string): Promise<string> {
  await prepareMCPCloudContext();
  const resolved = await getCloudResourceDetailById({ spaceId, resourceId }, 'doc');
  if (!resolved) {
    throw new Error(t('mcp.docs.cloudDetailFailed'));
  }

  const resource = resolved.detail;
  if (resource.type !== 'doc' || !resource.doc?.content) {
    throw new Error(t('mcp.docs.targetNotReadable'));
  }

  return resource.doc.content;
}
