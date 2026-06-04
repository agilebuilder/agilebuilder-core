import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { AppError } from '../errors/app-error.js';
import { t } from '../i18n/index.js';
import { writeSuccess } from '../output/format.js';
import { LocalResourceRepository } from '../resources/local-repository.js';
import { TemplateEngine } from '../template/engine.js';
import { parseVarAssignments, parseVarsJson } from '../template/variables.js';
import { WorkspaceStore } from '../workspace/store.js';
import { LOCAL_SPACE_ID } from '../shared/constants.js';
import { CloudResourceRepository } from '../resources/cloud-repository.js';
import type { CloudResourceDetail } from '../client/client-api.js';

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
  json?: boolean;
}

async function loadVariables(options: CreateOptions): Promise<Record<string, unknown>> {
  const fromFile = options.vars
    ? parseVarsJson(JSON.parse(await readFile(options.vars, 'utf8')))
    : {};
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
    .option('--json', 'Output JSON')
    .action(async (resourceId: string | undefined, options: CreateOptions) => {
      const variables = await loadVariables(options);
      let gitUrl = options.gitUrl;
      let branch = options.branch;
      let subdir = options.subdir;

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
          const source = extractCloudGitSource(resource);
          gitUrl = source.gitUrl;
          branch = branch || source.branch;
          subdir = subdir || source.subdir;
          await cloudRepository.recordAccess(current.id, resourceId).catch(() => undefined);
        }
      }

      const result = await engine.generateFromGit({
        gitUrl,
        branch,
        subdir,
        targetDir: options.target!,
        variables,
        overwrite: options.overwrite,
        keepGit: options.keepGit,
        allowHooks: options.allowHooks,
      });

      writeSuccess(result, options);
    });
}

function extractCloudGitSource(resource: CloudResourceDetail): {
  gitUrl: string;
  branch?: string;
  subdir?: string;
} {
  if (resource.type !== 'template' || !resource.template) {
    throw new AppError({
      code: 'CREATE_REQUIRES_TEMPLATE',
      message: t('create.requiresTemplate', { id: resource.id }),
      category: 'validation',
    });
  }

  const git = resource.template.definition?.source?.git;
  const gitUrl = git?.repo || resource.template.gitRepo;
  if (!gitUrl) {
    throw new AppError({
      code: 'CLOUD_TEMPLATE_GIT_SOURCE_REQUIRED',
      message: `Cloud template ${resource.id} does not expose a Git source.`,
      category: 'validation',
    });
  }

  return {
    gitUrl,
    branch: git?.branch || resource.template.gitBranch || 'main',
    subdir: git?.subfolder,
  };
}
