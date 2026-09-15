import { AppError } from '../../errors/app-error.js';
import { LOCAL_SPACE_ID } from '../../shared/constants.js';
import { WorkspaceStore } from '../../workspace/store.js';
import { LocalResourceRepository } from '../../resources/local-repository.js';
import { CloudResourceRepository } from '../../resources/cloud-repository.js';
import { TemplateEngine } from '../../template/engine.js';
import { inspectTemplateVariables } from '../../template/inspect.js';
import { parseType } from '../shared.js';
import { getMCPContext } from '../context.js';
import { resolveTemplateResourceRef } from './template-resource-resolver.js';
import type { LocalResource } from '../../resources/types.js';
import type { TemplateConfig } from '../../template/config.js';

const localRepository = new LocalResourceRepository();
const cloudRepository = new CloudResourceRepository();
const engine = new TemplateEngine();

export const toolSchemas = [
  {
    name: 'list_resources',
    title: 'List Workspace Resources',
    description:
      'List all template and doc resources in the current AgileBuilder workspace. This is the preferred way to discover templates: workspaces are usually small, so review the full set and judge matches by meaning (names, descriptions, tags), not by keyword. Optionally filter by type; use search_resources only to narrow down a large workspace.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['template', 'doc'], description: 'Optional filter: return only templates or only docs. Omit to return both.' },
      },
    },
  },
  {
    name: 'search_resources',
    title: 'Search Workspace Resources',
    description:
      'Search resources in the current AgileBuilder workspace by keyword. Matching is plain case-insensitive substring over name, description, tags, source URL, and doc content — there is NO semantic understanding, so a "backend" request will not match a "java-api" template unless its metadata says so. Use this only to narrow down a large workspace or as a quick probe; if it returns nothing, fall back to list_resources and evaluate the full set yourself before concluding there is no match. Omitting keyword returns the same result as list_resources.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        keyword: { type: 'string', description: 'Case-insensitive substring keyword. Try several variants (e.g. backend, server, java, spring) before concluding there is no match. Omit to list everything (equivalent to list_resources).' },
        type: { type: 'string', enum: ['template', 'doc'], description: 'Optional filter: return only templates or only docs. Omit to return both.' },
      },
    },
  },
  {
    name: 'get_resource',
    title: 'Get Resource Details',
    description:
      'Get one resource by ID from the current AgileBuilder workspace. Call this after list_resources/search_resources and before create_project: for templates it returns the git source, branch/subdir, and the variable list (name, type, required, default) you must collect from the user. For docs it returns the full text.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        resourceId: { type: 'string', description: 'Resource ID from list_resources or search_resources.' },
      },
      required: ['resourceId'],
    },
  },
  {
    name: 'create_project',
    title: 'Create Project from Template',
    description:
      'Generate a project from a workspace template (resourceId, preferred) or a direct Git URL. Writes rendered files into targetPath and can run template hooks. Only call this after get_resource confirmed the variable list and the user confirmed variables and targetPath. Fails safely (TARGET_NOT_EMPTY) on a non-empty targetPath unless overwrite is true.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        resourceId: { type: 'string', description: 'Template resource ID (alternative to gitUrl). Preferred: it uses team-approved templates from the workspace.' },
        gitUrl: { type: 'string', description: 'Direct Git URL (alternative to resourceId). Use only when no workspace template fits.' },
        branch: { type: 'string', description: 'Git branch to clone. Defaults to the branch registered on the resource, or the remote default branch.' },
        subdir: { type: 'string', description: 'Template subdirectory within the Git repository. Must be a relative path that stays inside the repository.' },
        targetPath: { type: 'string', description: 'Local directory where the project will be generated. Must not be a system directory or drive root; a non-empty directory requires overwrite: true.' },
        variables: { type: 'object', description: 'Template variables as a JSON object. Variable names come from the template variable list returned by get_resource. Missing required variables fail with TEMPLATE_VARS_MISSING.' },
        overwrite: { type: 'boolean', description: 'Default false. Allow writing into a non-empty targetPath. Set true only after the user explicitly confirmed the existing contents may be overwritten.' },
        keepGit: { type: 'boolean', description: 'Default false. Keep the template\'s .git directory (and its history) in the generated project.' },
        allowHooks: { type: 'boolean', description: 'Default false. Allow template hooks to run after files are written. Hooks are arbitrary shell scripts; set true only when the user explicitly asked for them.' },
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

async function resolveLocalTemplateVariables(resource: LocalResource): Promise<LocalResource> {
  if (resource.type !== 'template' || resource.variables !== undefined) {
    return resource;
  }
  try {
    const variables = await inspectTemplateVariables({
      gitUrl: resource.gitUrl,
      branch: resource.branch,
      subdir: resource.subdir,
    });
    const saved = await localRepository.saveTemplateVariables(resource.id, variables).catch(() => null);
    return saved ?? { ...resource, variables };
  } catch {
    return resource;
  }
}

export async function getResource(args: Record<string, unknown>) {
  const resourceId = String(args.resourceId || '');
  if (!resourceId) {
    throw new AppError({ code: 'RESOURCE_ID_REQUIRED', message: 'resourceId is required.', category: 'validation' });
  }
  const current = WorkspaceStore.getCurrent();
  if (current.id !== LOCAL_SPACE_ID) {
    const resource = await cloudRepository.get(current.id, resourceId);
    return { ok: true, data: resource };
  }
  const resource = await resolveLocalTemplateVariables(await localRepository.require(resourceId));
  return { ok: true, data: resource };
}

function validateVariables(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError({
      code: 'INVALID_VARIABLES',
      message: 'variables must be a JSON object, not an array or primitive.',
      category: 'validation',
    });
  }
  return value as Record<string, unknown>;
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
  const variables = validateVariables(args.variables);

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
