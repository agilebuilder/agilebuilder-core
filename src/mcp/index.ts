#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { APP_VERSION } from '../shared/constants.js';
import { AppError, toAppError } from '../errors/app-error.js';
import { getMCPContext } from './context.js';
import { toolResult, errorResult } from './shared.js';
import { listMcpResources, readMcpResource, USAGE_GUIDE_URI } from './resources/index.js';
import { toolSchemas, listResources, getResource, createProject } from './tools/index.js';

const server = new Server(
  { name: 'agilebuilder-core1-mcp', version: APP_VERSION },
  { capabilities: { tools: {}, resources: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolSchemas,
}));

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    const context = await getMCPContext();
    return await listMcpResources(context.spaceId);
  } catch {
    return { resources: [{ uri: USAGE_GUIDE_URI, name: 'AgileBuilder Core1 Usage Guide', mimeType: 'text/markdown' }] };
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  try {
    const context = await getMCPContext();
    return await readMcpResource(request.params.uri, context.spaceId);
  } catch (error) {
    const appError = toAppError(error);
    throw new Error(`[${appError.code}] ${appError.message}`);
  }
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const args = (request.params.arguments || {}) as Record<string, unknown>;
    switch (request.params.name) {
      case 'list_resources':
        return toolResult(await listResources(args));
      case 'search_resources':
        return toolResult(await listResources(args));
      case 'get_resource':
        return toolResult(await getResource(args));
      case 'create_project':
        return toolResult(await createProject(args));
      default:
        throw new AppError({ code: 'UNKNOWN_TOOL', message: `Unknown tool: ${request.params.name}`, category: 'validation' });
    }
  } catch (error) {
    return errorResult(error);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
