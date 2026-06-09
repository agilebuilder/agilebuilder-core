import { AppError } from '../errors/app-error.js';
import { normalizeTemplateConfig } from './config.js';
import type { CloudResourceDetail } from '../client/client-api.js';
import type { TemplateConfig } from './config.js';

export interface CloudTemplateGenerateOptions {
  gitUrl: string;
  branch?: string;
  subdir?: string;
  templateConfig?: TemplateConfig;
}

export function cloudResourceToGenerateOptions(resource: CloudResourceDetail): CloudTemplateGenerateOptions {
  if (resource.type !== 'template' || !resource.template) {
    throw new AppError({
      code: 'CREATE_REQUIRES_TEMPLATE',
      message: `Resource ${resource.id} is not a template.`,
      category: 'validation',
    });
  }

  const definition = resource.template.definition;
  const git = definition?.source?.git;
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
    templateConfig: definition?.configSource === 'workspace'
      ? normalizeTemplateConfig({
          version: 1,
          variables: definition.variables,
          hooks: definition.hooks,
        })
      : undefined,
  };
}
