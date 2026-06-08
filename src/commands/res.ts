import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { AppError } from '../errors/app-error.js';
import { t } from '../i18n/index.js';
import { printError, writeSuccess } from '../output/format.js';
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
  description?: string;
  tags?: string;
}

interface AddDocOptions extends JsonOption {
  name: string;
  file?: string;
  uri?: string;
  content?: string;
  format?: 'markdown' | 'text';
  description?: string;
  tags?: string;
}

interface EditOptions extends JsonOption {
  name?: string;
  gitUrl?: string;
  branch?: string;
  subdir?: string;
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
        writeSuccess({ workspaceId: current.id, items, total: items.length }, options);
        return;
      }
      const result = await cloudRepository.list({ spaceId: current.id, type });
      writeSuccess({ workspaceId: current.id, ...result }, options);
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
        writeSuccess({ workspaceId: current.id, items, total: items.length }, options);
        return;
      }
      const result = await cloudRepository.list({ spaceId: current.id, type, keyword });
      writeSuccess({ workspaceId: current.id, ...result }, options);
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
      writeSuccess(resource, options);
    });

  const add = new Command('add')
    .description(t('res.add.description'));

  add
    .command('template')
    .requiredOption('--name <name>', 'Resource name')
    .requiredOption('--git-url <url>', 'Git repository URL')
    .option('--branch <branch>', 'Git branch', 'main')
    .option('--subdir <path>', 'Template subdirectory')
    .option('--description <text>', 'Description')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--json', 'Output JSON')
    .description(t('res.add.template.description'))
    .action(async (options: AddTemplateOptions) => {
      ensureLocalWorkspace();
      const resource = await repository.addTemplate({
        name: options.name,
        gitUrl: options.gitUrl,
        branch: options.branch,
        subdir: options.subdir,
        description: options.description,
        tags: parseTags(options.tags),
      });
      writeSuccess(resource, options);
    });

  add
    .command('doc')
    .requiredOption('--name <name>', 'Resource name')
    .option('--file <path>', 'Read content from file')
    .option('--uri <uri>', 'Document URI')
    .option('--content <text>', 'Document content')
    .option('--format <format>', 'Document format')
    .option('--description <text>', 'Description')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--json', 'Output JSON')
    .description(t('res.add.doc.description'))
    .action(async (options: AddDocOptions) => {
      ensureLocalWorkspace();
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
      const resource = await repository.addDoc({
        name: options.name,
        uri: options.uri || `local-doc://${options.name}`,
        content,
        format: options.format || 'markdown',
        description: options.description,
        tags: parseTags(options.tags),
      });
      writeSuccess(resource, options);
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
    .option('--uri <uri>', 'Document URI')
    .option('--file <path>', 'Read document content from file')
    .option('--content <text>', 'Document content')
    .option('--format <format>', 'Document format')
    .option('--description <text>', 'Description')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--json', 'Output JSON')
    .action(async (id: string, options: EditOptions) => {
      ensureLocalWorkspace();
      const current = await repository.require(id);
      validateEditOptions(current.type, options);
      const content = options.file
        ? await readFile(options.file, 'utf8')
        : options.content;
      const resource = await repository.update(id, {
        name: options.name,
        gitUrl: options.gitUrl,
        branch: options.branch,
        subdir: options.subdir,
        uri: options.uri,
        content,
        format: options.format,
        description: options.description,
        tags: options.tags === undefined ? undefined : parseTags(options.tags),
      });
      writeSuccess(resource, options);
    });

  command
    .command('remove')
    .alias('rm')
    .argument('<id>')
    .description(t('res.remove.description'))
    .option('--yes', 'Confirm removal')
    .option('--json', 'Output JSON')
    .action(async (id: string, options: JsonOption & { yes?: boolean }) => {
      ensureLocalWorkspace();
      if (!options.yes) {
        throw new AppError({
          code: 'CONFIRMATION_REQUIRED',
          message: t('create.removeConfirmationRequired'),
          category: 'validation',
        });
      }
      const removed = await repository.remove(id);
      if (!removed) {
        throw new AppError({
          code: 'RESOURCE_NOT_FOUND',
          message: t('res.notFound', { id }),
          category: 'resource',
        });
      }
      writeSuccess({ message: t('res.remove.success'), id }, options);
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

function ensureLocalWorkspace(): void {
  const current = WorkspaceStore.getCurrent();
  if (current.id !== LOCAL_SPACE_ID) {
    throw new AppError({
      code: 'LOCAL_WORKSPACE_REQUIRED',
      message: 'This command only writes local resources. Switch with ag space use local.',
      category: 'validation',
    });
  }
}

function validateEditOptions(type: ResourceType, options: EditOptions): void {
  const commonFields = [
    options.name,
    options.description,
    options.tags,
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
