import { AppError } from '../../errors/app-error.js';
import { LOCAL_SPACE_ID } from '../../shared/constants.js';
import { WorkspaceStore } from '../../workspace/store.js';
import { LocalResourceRepository } from '../../resources/local-repository.js';
import { CloudResourceRepository } from '../../resources/cloud-repository.js';
import { TemplateEngine } from '../../template/engine.js';
import { parseType } from '../shared.js';
import { getMCPContext } from '../context.js';
import { resolveTemplateResourceRef } from './template-resource-resolver.js';
import type { TemplateConfig } from '../../template/config.js';

const localRepository = new LocalResourceRepository();
const cloudRepository = new CloudResourceRepository();
const engine = new TemplateEngine();

export const toolSchemas = [
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
        allowHooks: { type: 'boolean' },
      },
      required: ['targetPath'],
    },
  },
];

export async function listResources(args: Record<string, unknown>) {
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

export async function getResource(args: Record<string, unknown>) {
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

export async function createProject(args: Record<string, unknown>) {
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
    const context = await getMCPContext();
    const resolved = await resolveTemplateResourceRef(context, resourceId);
    gitUrl = resolved.gitUrl;
    branch = branch || resolved.branch;
    subdir = subdir || resolved.subdir;
    templateConfig = resolved.templateConfig;
    if (resolved.source === 'cloud' && resolved.spaceId) {
      await cloudRepository.recordAccess(resolved.spaceId, resourceId).catch(() => undefined);
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
    allowHooks: args.allowHooks === true,
  });
  return { ok: true, data: result };
}
