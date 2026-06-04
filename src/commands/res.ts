import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { AppError } from '../errors/app-error.js';
import { t } from '../i18n/index.js';
import { printError, writeSuccess } from '../output/format.js';
import { LocalResourceRepository } from '../resources/local-repository.js';
import type { ResourceType } from '../resources/types.js';

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
      const items = await repository.list({ type });
      writeSuccess({ items, total: items.length }, options);
    });

  command
    .command('search')
    .argument('<keyword>')
    .description(t('res.search.description'))
    .option('--type <type>', 'Filter by resource type')
    .option('--json', 'Output JSON')
    .action(async (keyword: string, options: ListOptions) => {
      const type = parseResourceType(options.type);
      const items = await repository.list({ type, keyword });
      writeSuccess({ items, total: items.length }, options);
    });

  command
    .command('get')
    .argument('<id>')
    .description(t('res.get.description'))
    .option('--json', 'Output JSON')
    .action(async (id: string, options: JsonOption) => {
      const resource = await repository.require(id);
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
    .command('remove')
    .alias('rm')
    .argument('<id>')
    .description(t('res.remove.description'))
    .option('--yes', 'Confirm removal')
    .option('--json', 'Output JSON')
    .action(async (id: string, options: JsonOption & { yes?: boolean }) => {
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
