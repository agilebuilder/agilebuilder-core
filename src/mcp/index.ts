#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { APP_VERSION, LOCAL_SPACE_ID } from '../shared/constants.js';
import { WorkspaceStore } from '../workspace/store.js';
import { LocalResourceRepository } from '../resources/local-repository.js';
import { CloudResourceRepository } from '../resources/cloud-repository.js';
import { TemplateEngine } from '../template/engine.js';
import { cloudResourceToGenerateOptions } from '../template/cloud-resource.js';
import { AppError, toAppError } from '../errors/app-error.js';
import type { ResourceType } from '../resources/types.js';
import type { TemplateConfig } from '../template/config.js';

const localRepository = new LocalResourceRepository();
const cloudRepository = new CloudResourceRepository();
const engine = new TemplateEngine();

const USAGE_GUIDE_URI = 'agilebuilder://docs/usage';
const LOCAL_DOC_PREFIX = 'agilebuilder://local/docs/';
const CLOUD_DOC_PREFIX = 'agilebuilder://cloud/docs/';

const server = new Server(
  { name: 'agilebuilder-core1-mcp', version: APP_VERSION },
  { capabilities: { tools: {} } },
);

function toolResult(value: unknown) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(error: unknown) {
  const appError = toAppError(error);
  return toolResult({
    ok: false,
    error: {
      code: appError.code,
      message: appError.message,
      suggestion: appError.suggestion,
      category: appError.category,
      details: appError.details,
    },
  });
}

function parseType(value: unknown): ResourceType | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'template' || value === 'doc') return value;
  throw new AppError({ code: 'INVALID_RESOURCE_TYPE', message: `Invalid resource type: ${String(value)}`, category: 'validation' });
}

async function listMcpResources() {
  const current = WorkspaceStore.getCurrent();
  const resources = [
    {
      uri: USAGE_GUIDE_URI,
      name: 'AgileBuilder Core1 Usage Guide',
      mimeType: 'text/markdown',
    },
  ];

  if (current.id === LOCAL_SPACE_ID) {
    const docs = await localRepository.list({ type: 'doc' });
    resources.push(...docs.map((doc) => ({
      uri: `${LOCAL_DOC_PREFIX}${encodeURIComponent(doc.id)}`,
      name: doc.name,
      mimeType: doc.type === 'doc' && doc.format === 'markdown' ? 'text/markdown' : 'text/plain',
    })));
    return { resources };
  }

  const cloudDocs = await cloudRepository.list({ spaceId: current.id, type: 'doc' });
  resources.push(...cloudDocs.items.map((doc) => ({
    uri: `${CLOUD_DOC_PREFIX}${encodeURIComponent(doc.id)}`,
    name: doc.name,
    mimeType: 'text/markdown',
  })));
  return { resources };
}

function usageGuideText(): string {
  return [
    '# AgileBuilder Core1',
    '',
    'Available MCP tools:',
    '',
    '- `list_resources`: list resources in the current workspace.',
    '- `search_resources`: search resources by keyword.',
    '- `get_resource`: read one resource by ID.',
    '- `create_project`: create a project from a resource ID or Git URL.',
    '',
    'Resources default to the currently selected AgileBuilder workspace.',
  ].join('\n');
}

async function readMcpResource(uri: string) {
  if (uri === USAGE_GUIDE_URI) {
    return {
      contents: [{ uri, mimeType: 'text/markdown', text: usageGuideText() }],
    };
  }

  if (uri.startsWith(LOCAL_DOC_PREFIX)) {
    const id = decodeURIComponent(uri.slice(LOCAL_DOC_PREFIX.length));
    const resource = await localRepository.require(id);
    if (resource.type !== 'doc') {
      throw new AppError({ code: 'RESOURCE_NOT_DOC', message: `Resource ${id} is not a document.`, category: 'validation' });
    }
    return {
      contents: [{ uri, mimeType: resource.format === 'markdown' ? 'text/markdown' : 'text/plain', text: resource.content }],
    };
  }

  if (uri.startsWith(CLOUD_DOC_PREFIX)) {
    const current = WorkspaceStore.getCurrent();
    if (current.id === LOCAL_SPACE_ID) {
      throw new AppError({ code: 'CLOUD_WORKSPACE_REQUIRED', message: 'Select a cloud workspace to read cloud docs.', category: 'validation' });
    }
    const id = decodeURIComponent(uri.slice(CLOUD_DOC_PREFIX.length));
    const resource = await cloudRepository.get(current.id, id);
    if (resource.type !== 'doc') {
      throw new AppError({ code: 'RESOURCE_NOT_DOC', message: `Resource ${id} is not a document.`, category: 'validation' });
    }
    return {
      contents: [{
        uri,
        mimeType: resource.doc?.format === 'text' ? 'text/plain' : 'text/markdown',
        text: resource.doc?.content || '',
      }],
    };
  }

  throw new AppError({ code: 'RESOURCE_URI_UNSUPPORTED', message: `Unsupported resource URI: ${uri}`, category: 'validation' });
}

async function listResources(args: Record<string, unknown>) {
  const current = WorkspaceStore.getCurrent();
  const type = parseType(args.type);
  const keyword = typeof args.keyword === 'string' ? args.keyword : undefined;
  if (current.id === LOCAL_SPACE_ID) {
    const items = await localRepository.list({ type, keyword });
    return { ok: true, data: { workspaceId: current.id, items, total: items.length } };
  }
  const result = await cloudRepository.list({ spaceId: current.id, type, keyword });
  return { ok: true, data: { workspaceId: current.id, ...result } };
}

async function getResource(args: Record<string, unknown>) {
  const resourceId = String(args.resourceId || '');
  if (!resourceId) {
    throw new AppError({ code: 'RESOURCE_ID_REQUIRED', message: 'resourceId is required.', category: 'validation' });
  }
  const current = WorkspaceStore.getCurrent();
  const resource = current.id === LOCAL_SPACE_ID
    ? await localRepository.require(resourceId)
    : await cloudRepository.get(current.id, resourceId);
  return { ok: true, data: resource };
}

async function createProject(args: Record<string, unknown>) {
  const targetPath = String(args.targetPath || '');
  if (!targetPath) {
    throw new AppError({ code: 'TARGET_PATH_REQUIRED', message: 'targetPath is required.', category: 'validation' });
  }

  let gitUrl = typeof args.gitUrl === 'string' ? args.gitUrl : undefined;
  let branch = typeof args.branch === 'string' ? args.branch : undefined;
  let subdir = typeof args.subdir === 'string' ? args.subdir : undefined;
  let templateConfig: TemplateConfig | undefined;
  const variables = args.variables && typeof args.variables === 'object' && !Array.isArray(args.variables)
    ? args.variables as Record<string, unknown>
    : {};

  if (!gitUrl) {
    const resourceId = String(args.resourceId || '');
    if (!resourceId) {
      throw new AppError({ code: 'CREATE_SOURCE_REQUIRED', message: 'resourceId or gitUrl is required.', category: 'validation' });
    }
    const current = WorkspaceStore.getCurrent();
    if (current.id === LOCAL_SPACE_ID) {
      const resource = await localRepository.require(resourceId);
      if (resource.type !== 'template') {
        throw new AppError({ code: 'CREATE_REQUIRES_TEMPLATE', message: `Resource ${resourceId} is not a template.`, category: 'validation' });
      }
      gitUrl = resource.gitUrl;
      branch = branch || resource.branch;
      subdir = subdir || resource.subdir;
    } else {
      const resource = await cloudRepository.get(current.id, resourceId);
      const source = cloudResourceToGenerateOptions(resource);
      gitUrl = source.gitUrl;
      branch = branch || source.branch;
      subdir = subdir || source.subdir;
      templateConfig = source.templateConfig;
      await cloudRepository.recordAccess(current.id, resourceId).catch(() => undefined);
    }
  }

  const result = await engine.generateFromGit({
    gitUrl,
    branch,
    subdir,
    targetDir: targetPath,
    variables,
    templateConfig,
    overwrite: args.overwrite === true,
    keepGit: args.keepGit === true,
  });
  return { ok: true, data: result };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_resources',
      description: 'List resources in the current AgileBuilder workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['template', 'doc'] },
        },
      },
    },
    {
      name: 'search_resources',
      description: 'Search resources in the current AgileBuilder workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string' },
          type: { type: 'string', enum: ['template', 'doc'] },
        },
      },
    },
    {
      name: 'get_resource',
      description: 'Get one resource by ID from the current AgileBuilder workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          resourceId: { type: 'string' },
        },
        required: ['resourceId'],
      },
    },
    {
      name: 'create_project',
      description: 'Create a project from a resource ID or direct Git URL.',
      inputSchema: {
        type: 'object',
        properties: {
          resourceId: { type: 'string' },
          gitUrl: { type: 'string' },
          branch: { type: 'string' },
          subdir: { type: 'string' },
          targetPath: { type: 'string' },
          variables: { type: 'object' },
          overwrite: { type: 'boolean' },
          keepGit: { type: 'boolean' },
        },
        required: ['targetPath'],
      },
    },
  ],
}));

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    return await listMcpResources();
  } catch {
    return { resources: [{ uri: USAGE_GUIDE_URI, name: 'AgileBuilder Core1 Usage Guide', mimeType: 'text/markdown' }] };
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  try {
    return await readMcpResource(request.params.uri);
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
