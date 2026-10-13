import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { AppError } from '../errors/app-error.js';
import { t } from '../i18n/index.js';
import { writeSuccess } from '../output/format.js';
import { renderCreateResult } from '../output/cli-renderers.js';
import { LocalResourceRepository } from '../resources/local-repository.js';
import { TemplateEngine } from '../template/engine.js';
import { cloudResourceToGenerateOptions } from '../template/cloud-resource.js';
import { parseVarAssignments } from '../template/variables.js';
import { WorkspaceStore } from '../workspace/store.js';
import { ConfigStore } from '../config/store.js';
import { LOCAL_SPACE_ID } from '../shared/constants.js';
import { CloudResourceRepository } from '../resources/cloud-repository.js';
import type { TemplateConfig } from '../template/config.js';

interface CreateOptions {
  gitUrl?: string;
  branch?: string;
  subdir?: string;
  target?: string;
  vars?: string;
  var?: string[];
  overwrite?: boolean;
  keepGit?: boolean;
  allowHooks?: boolean;
  interactive?: boolean;
  json?: boolean;
}

async function loadVariables(options: CreateOptions): Promise<Record<string, unknown>> {
  let fromFile: Record<string, unknown> = {};
  if (options.vars) {
    let raw: string;
    try {
      raw = await readFile(options.vars, 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      throw new AppError({
        code: 'TEMPLATE_VARS_FILE_INVALID',
        message: t('create.varsFileReadFailed', { path: options.vars }),
        suggestion: code === 'ENOENT'
          ? 'Check that the file path is correct.'
          : 'Check that the file is readable.',
        category: 'validation',
      });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AppError({
        code: 'TEMPLATE_VARS_FILE_INVALID',
        message: t('create.varsFileInvalidJson', { path: options.vars }),
        suggestion: 'The --vars file must contain a single JSON object.',
        category: 'validation',
      });
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new AppError({
        code: 'TEMPLATE_VARS_FILE_INVALID',
        message: t('create.varsFileInvalidJson', { path: options.vars }),
        suggestion: 'The --vars file must contain a single JSON object.',
        category: 'validation',
      });
    }
    fromFile = parsed as Record<string, unknown>;
  }
  return {
    ...fromFile,
    ...parseVarAssignments(options.var),
  };
}

export function createCreateCommand(): Command {
  const repository = new LocalResourceRepository();
  const cloudRepository = new CloudResourceRepository();
  const engine = new TemplateEngine();

  return new Command('create')
    .argument('[resource-id]')
    .description(t('create.description'))
    .option('--git-url <url>', 'Create directly from Git URL')
    .option('--branch <branch>', 'Git branch')
    .option('--subdir <path>', 'Template subdirectory')
    .requiredOption('--target <dir>', 'Target directory')
    .option('--vars <path>', 'JSON file with template variables')
    .option('--var <assignment...>', 'Template variable assignment, key=value')
    .option('--overwrite', 'Allow writing into non-empty target directory')
    .option('--keep-git', 'Keep .git directory when copying template')
    .option('--allow-hooks', 'Allow template hooks')
    .option('--interactive', t('create.interactive.description'))
    .option('--json', 'Output JSON')
    .action(async (resourceId: string | undefined, options: CreateOptions) => {
      if (options.interactive && options.json) {
        throw new AppError({
          code: 'INTERACTIVE_JSON_CONFLICT',
          message: t('create.interactive.jsonConflict'),
          category: 'validation',
        });
      }
      if (options.interactive && !process.stdin.isTTY) {
        throw new AppError({
          code: 'INTERACTIVE_NOT_TTY',
          message: t('create.interactive.notTty'),
          category: 'validation',
        });
      }

      const variables = await loadVariables(options);
      let gitUrl = options.gitUrl;
      let branch = options.branch;
      let subdir = options.subdir;
      let templateConfig: TemplateConfig | undefined;

      if (!gitUrl) {
        if (!resourceId) {
          throw new AppError({
            code: 'CREATE_SOURCE_REQUIRED',
            message: t('create.sourceRequired'),
            suggestion: t('create.sourceRequiredSuggestion'),
            category: 'validation',
          });
        }

        const current = WorkspaceStore.getCurrent();
        if (current.id === LOCAL_SPACE_ID) {
          const resource = await repository.require(resourceId);
          if (resource.type !== 'template') {
            throw new AppError({
              code: 'CREATE_REQUIRES_TEMPLATE',
              message: t('create.requiresTemplate', { id: resourceId }),
              category: 'validation',
            });
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

      const config = ConfigStore.load();
      const allowHooks = options.allowHooks ?? config.template.allowHooksDefault;
      const result = await engine.generateFromGit({
        gitUrl,
        branch,
        subdir,
        targetDir: options.target!,
        variables,
        templateConfig,
        overwrite: options.overwrite,
        keepGit: options.keepGit,
        allowHooks,
        interactive: options.interactive,
      });

      writeSuccess(result, options, renderCreateResult);
    });
}
