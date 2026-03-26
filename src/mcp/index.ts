/**
 * MCP 服务入口
 *
 * 提供 AgileBuilder 的 MCP 服务，包括：
 * - Tools: 模板管理、空间信息
 * - Resources: 文档资源
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MCP_SERVER_NAME, MCP_VERSION } from '../shared/constants.js';
import { initDatabase } from '../db/index.js';
import { t } from '../i18n/index.js';

// Tools
import { TOOLS } from './tools/index.js';
import { listTemplates } from './tools/templates/list.js';
import { searchTemplates } from './tools/templates/search.js';
import { getTemplateInfo } from './tools/templates/info.js';
import { cloneTemplate } from './tools/templates/clone.js';

// Resources
import { listDocResources, readDocResource } from './resources/index.js';

// 创建 MCP 服务器
const server = new Server(
  { name: MCP_SERVER_NAME, version: MCP_VERSION },
  { capabilities: { tools: {}, resources: {} } }
);

/**
 * 列出所有可用的 Tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

/**
 * 列出所有可用的 Resources
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const { resources } = await listDocResources();
  return { resources };
});

/**
 * 读取 Resource 内容
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const result = await readDocResource(uri);

  if (!result.success) {
    throw new Error(`[${result.error.code}] ${result.error.message}`);
  }

  return {
    contents: [result.content],
  };
});

/**
 * 调用 Tool
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // 模板相关
      case 'listTemplates':
        return await listTemplates(args || {});
      case 'searchTemplates':
        return await searchTemplates(args as any);
      case 'getTemplateInfo':
        return await getTemplateInfo(args as any);
      case 'createProjectByTemplate':
        return await cloneTemplate(args as any);

      default:
        throw new Error(t('mcp.unknownTool', { name }));
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
              success: false,
              error: {
                code: 'TOOL_ERROR',
                message: error instanceof Error ? error.message : t('common.unknownError'),
              },
            }),
        },
      ],
    };
  }
});

/**
 * 启动 MCP 服务
 */
async function main() {
  await initDatabase();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(t('mcp.serverRunning'));
}

main().catch((error) => {
  console.error(`${t('mcp.fatalError')}:`, error);
  process.exit(1);
});
