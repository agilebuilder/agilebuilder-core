import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { AppError } from '../errors/app-error.js';
import { t } from '../i18n/index.js';
import { printError, writeSuccess } from '../output/format.js';
import {
  renderResourceDetail,
  renderResourceList,
  renderResourceRemoved,
  renderResourceSaved,
} from '../output/cli-renderers.js';
import { LocalResourceRepository } from '../resources/local-repository.js';
import type { ResourceType } from '../resources/types.js';
import { WorkspaceStore } from '../workspace/store.js';
import { LOCAL_SPACE_ID } from '../shared/constants.js';
import { CloudResourceRepository } from '../resources/cloud-repository.js';

interface JsonOption {
  json?: boolean;
}

interface ListOptions extends JsonOption {
  type?: ResourceType;
}

interface AddTemplateOptions extends JsonOption {
  name: string;
  gitUrl: string;
  branch?: string;
  subdir?: string;
  parentId?: string;
  spaceId?: string;
  description?: string;
  tags?: string;
}

interface AddDocOptions extends JsonOption {
  name: string;
  file?: string;
  uri?: string;
  content?: string;
  format?: 'markdown' | 'text';
  parentId?: string;
  spaceId?: string;
  description?: string;
  tags?: string;
}

interface EditOptions extends JsonOption {
  name?: string;
  gitUrl?: string;
  branch?: string;
  subdir?: string;
  parentId?: string;
  spaceId?: string;
  uri?: string;
  file?: string;
  content?: string;
  format?: 'markdown' | 'text';
  description?: string;
  tags?: string;
}

function parseTags(value: string | undefined): string[] {
  return value ? value.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
}

function parseResourceType(value: string | undefined): ResourceType | undefined {
  if (!value) return undefined;
  if (value === 'template' || value === 'doc') return value;
  throw new AppError({
    code: 'UNSUPPORTED_RESOURCE_TYPE',
    message: t('res.unsupportedType', { type: value }),
    category: 'validation',
  });
}

export function createResCommand(): Command {
  const repository = new LocalResourceRepository();
  const cloudRepository = new CloudResourceRepository();
  const command = new Command('res')
    .alias('resource')
    .description(t('res.description'));

  command
    .command('list')
    .alias('ls')
    .description(t('res.list.description'))
    .option('--type <type>', 'Filter by resource type')
    .option('--json', 'Output JSON')
    .action(async (options: ListOptions) => {
      const type = parseResourceType(options.type);
      const current = WorkspaceStore.getCurrent();
      if (current.id === LOCAL_SPACE_ID) {
        const items = await repository.list({ type });
        writeSuccess({ workspaceId: current.id, items, total: items.length }, options, renderResourceList);
        return;
      }
      const result = await cloudRepository.list({ spaceId: current.id, type });
      writeSuccess({ workspaceId: current.id, ...result }, options, renderResourceList);
    });

  command
    .command('search')
    .argument('<keyword>')
    .description(t('res.search.description'))
    .option('--type <type>', 'Filter by resource type')
    .option('--json', 'Output JSON')
    .action(async (keyword: string, options: ListOptions) => {
      const type = parseResourceType(options.type);
      const current = WorkspaceStore.getCurrent();
      if (current.id === LOCAL_SPACE_ID) {
        const items = await repository.list({ type, keyword });
        writeSuccess({ workspaceId: current.id, items, total: items.length }, options, renderResourceList);
        return;
      }
      const result = await cloudRepository.list({ spaceId: current.id, type, keyword });
      writeSuccess({ workspaceId: current.id, ...result }, options, renderResourceList);
    });

  command
    .command('get')
    .argument('<id>')
    .description(t('res.get.description'))
    .option('--json', 'Output JSON')
    .action(async (id: string, options: JsonOption) => {
      const current = WorkspaceStore.getCurrent();
      const resource = current.id === LOCAL_SPACE_ID
        ? await repository.require(id)
        : await cloudRepository.get(current.id, id);
      writeSuccess(resource, options, renderResourceDetail);
    });

  const add = new Command('add')
    .description(t('res.add.description'));

  add
    .command('template')
    .requiredOption('--name <name>', 'Resource name')
    .requiredOption('--git-url <url>', 'Git repository URL')
    .option('--branch <branch>', 'Git branch', 'main')
    .option('--subdir <path>', 'Template subdirectory')
    .option('--parent-id <id>', 'Cloud parent folder node ID')
    .option('--space-id <id>', 'Target workspace ID')
    .option('--description <text>', 'Description')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--json', 'Output JSON')
    .description(t('res.add.template.description'))
    .action(async (options: AddTemplateOptions) => {
      const target = resolveTargetWorkspace(options.spaceId);
      ensureCloudOnlyOption(target, options.parentId, '--parent-id');
      const input = {
        name: options.name,
        gitUrl: options.gitUrl,
        branch: options.branch,
        subdir: options.subdir,
        description: options.description,
        tags: parseTags(options.tags),
      };
      const resource = target === LOCAL_SPACE_ID
        ? await repository.addTemplate(input)
        : await cloudRepository.addTemplate(target, { ...input, parentId: options.parentId });
      writeSuccess(resource, options, renderResourceSaved);
    });

  add
    .command('doc')
    .requiredOption('--name <name>', 'Resource name')
    .option('--file <path>', 'Read content from file')
    .option('--uri <uri>', 'Document URI')
    .option('--content <text>', 'Document content')
    .option('--format <format>', 'Document format')
    .option('--parent-id <id>', 'Cloud parent folder node ID')
    .option('--space-id <id>', 'Target workspace ID')
    .option('--description <text>', 'Description')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--json', 'Output JSON')
    .description(t('res.add.doc.description'))
    .action(async (options: AddDocOptions) => {
      const target = resolveTargetWorkspace(options.spaceId);
      ensureCloudOnlyOption(target, options.parentId, '--parent-id');
      const content = options.file
        ? await readFile(options.file, 'utf8')
        : options.content;
      if (!content) {
        throw new AppError({
          code: 'DOC_CONTENT_REQUIRED',
          message: t('create.docContentRequired'),
          category: 'validation',
        });
      }
      const input = {
        name: options.name,
        uri: options.uri || `local-doc://${options.name}`,
        content,
        format: options.format || 'markdown',
        description: options.description,
        tags: parseTags(options.tags),
      };
      const resource = target === LOCAL_SPACE_ID
        ? await repository.addDoc(input)
        : await cloudRepository.addDoc(target, { ...input, parentId: options.parentId });
      writeSuccess(resource, options, renderResourceSaved);
    });

  command.addCommand(add);

  command
    .command('edit')
    .argument('<id>')
    .description(t('res.edit.description'))
    .option('--name <name>', 'Resource name')
    .option('--git-url <url>', 'Git repository URL')
    .option('--branch <branch>', 'Git branch')
    .option('--subdir <path>', 'Template subdirectory')
    .option('--parent-id <id>', 'Cloud parent folder node ID')
    .option('--space-id <id>', 'Target workspace ID')
    .option('--uri <uri>', 'Document URI')
    .option('--file <path>', 'Read document content from file')
    .option('--content <text>', 'Document content')
    .option('--format <format>', 'Document format')
    .option('--description <text>', 'Description')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--json', 'Output JSON')
    .action(async (id: string, options: EditOptions) => {
      const target = resolveTargetWorkspace(options.spaceId);
      ensureCloudOnlyOption(target, options.parentId, '--parent-id');
      const current = target === LOCAL_SPACE_ID
        ? await repository.require(id)
        : await cloudRepository.get(target, id);
      const type = requireEditableResourceType(current.type);
      validateEditOptions(type, options);
      const content = options.file
        ? await readFile(options.file, 'utf8')
        : options.content;
      const input = {
        name: options.name,
        gitUrl: options.gitUrl,
        branch: options.branch,
        subdir: options.subdir,
        parentId: options.parentId,
        uri: options.uri,
        content,
        format: options.format,
        description: options.description,
        tags: options.tags === undefined ? undefined : parseTags(options.tags),
      };
      const resource = target === LOCAL_SPACE_ID
        ? await repository.update(id, input)
        : await cloudRepository.update(target, id, input);
      if (!resource) {
        throw new AppError({
          code: 'RESOURCE_NOT_FOUND',
          message: t('res.notFound', { id }),
          category: 'resource',
        });
      }
      writeSuccess(resource, options, renderResourceSaved);
    });

  command
    .command('remove')
    .alias('rm')
    .argument('<id>')
    .description(t('res.remove.description'))
    .option('--yes', 'Confirm removal')
    .option('--space-id <id>', 'Target workspace ID')
    .option('--json', 'Output JSON')
    .action(async (id: string, options: JsonOption & { yes?: boolean; spaceId?: string }) => {
      const target = resolveTargetWorkspace(options.spaceId);
      if (!options.yes) {
        throw new AppError({
          code: 'CONFIRMATION_REQUIRED',
          message: t('create.removeConfirmationRequired'),
          category: 'validation',
        });
      }
      if (target === LOCAL_SPACE_ID) {
        const removed = await repository.remove(id);
        if (!removed) {
          throw new AppError({
            code: 'RESOURCE_NOT_FOUND',
            message: t('res.notFound', { id }),
            category: 'resource',
          });
        }
      } else {
        await cloudRepository.remove(target, id);
      }
      writeSuccess({ message: t('res.remove.success'), id }, options, renderResourceRemoved);
    });

  command
    .command('browse')
    .description('Interactive resource browser')
    .action(() => {
      printError(new AppError({
        code: 'NOT_IMPLEMENTED',
        message: 'Interactive resource browser is not implemented yet.',
      }));
    });

  return command;
}

function resolveTargetWorkspace(spaceId: string | undefined): string {
  const current = WorkspaceStore.getCurrent();
  return spaceId || current.id;
}

function ensureCloudOnlyOption(targetWorkspaceId: string, value: string | undefined, optionName: string): void {
  if (targetWorkspaceId === LOCAL_SPACE_ID && value !== undefined) {
    throw new AppError({
      code: 'LOCAL_WORKSPACE_UNSUPPORTED_OPTION',
      message: `${optionName} is only supported for cloud resources.`,
      category: 'validation',
    });
  }
}

function requireEditableResourceType(value: string): ResourceType {
  if (value === 'template' || value === 'doc') {
    return value;
  }
  throw new AppError({
    code: 'UNSUPPORTED_RESOURCE_TYPE',
    message: t('res.unsupportedType', { type: value }),
    category: 'validation',
  });
}

function validateEditOptions(type: ResourceType, options: EditOptions): void {
  const commonFields = [
    options.name,
    options.description,
    options.tags,
    options.parentId,
  ];
  const templateFields = [
    options.gitUrl,
    options.branch,
    options.subdir,
  ];
  const docFields = [
    options.uri,
    options.file,
    options.content,
    options.format,
  ];
  const hasAnyField = [...commonFields, ...templateFields, ...docFields].some((value) => value !== undefined);
  if (!hasAnyField) {
    throw new AppError({
      code: 'RESOURCE_EDIT_FIELD_REQUIRED',
      message: 'Pass at least one field to update.',
      category: 'validation',
    });
  }
  if (options.file && options.content) {
    throw new AppError({
      code: 'RESOURCE_EDIT_CONTENT_CONFLICT',
      message: 'Use only one of --file or --content.',
      category: 'validation',
    });
  }
  if (type === 'template' && docFields.some((value) => value !== undefined)) {
    throw new AppError({
      code: 'RESOURCE_EDIT_TYPE_MISMATCH',
      message: 'Document fields cannot be used when editing a template resource.',
      category: 'validation',
    });
  }
  if (type === 'doc' && templateFields.some((value) => value !== undefined)) {
    throw new AppError({
      code: 'RESOURCE_EDIT_TYPE_MISMATCH',
      message: 'Template fields cannot be used when editing a document resource.',
      category: 'validation',
    });
  }
}
