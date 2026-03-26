import chalk from 'chalk';
import inquirer from 'inquirer';
import { ResourcesDAO } from '../../../db/dao/resources.dao.js';
import { t } from '../../../i18n/index.js';
import { parseJSON } from '../../../shared/utils.js';
import type {
  CreateDocInput,
  CreateTemplateInput,
  LocalDocResource,
  LocalResource,
  LocalTemplateResource,
  UpdateDocInput,
  UpdateTemplateInput,
} from '../../../shared/types.js';

export function parseTagsInput(value: string): string[] | undefined {
  const tags = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

export function getStoredTags(resource: LocalResource): string[] {
  return parseJSON<string[]>(resource.tags) || [];
}

export async function promptResourceId(message: string): Promise<number | null> {
  const { resourceId } = await inquirer.prompt([
    {
      type: 'input',
      name: 'resourceId',
      message,
      validate: (input) => {
        const trimmed = input.trim();
        if (!trimmed) return t('res.idRequired');
        const id = Number.parseInt(trimmed, 10);
        if (Number.isNaN(id) || id <= 0) return t('res.idInvalid');
        return true;
      },
    },
  ]);

  return Number.parseInt(resourceId.trim(), 10);
}

export async function promptTemplateInput(existing?: LocalTemplateResource): Promise<CreateTemplateInput | UpdateTemplateInput> {
  const currentTags = existing ? getStoredTags(existing).join(', ') : '';
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: t('res.template.namePrompt'),
      default: existing?.name,
      validate: async (input) => {
        if (!input.trim()) return t('res.add.nameRequired');
        const duplicate = await ResourcesDAO.getByName(input.trim());
        if (duplicate && duplicate.id !== existing?.id) return t('res.add.nameExists');
        return true;
      },
    },
    {
      type: 'input',
      name: 'description',
      message: t('res.common.descriptionPrompt'),
      default: existing?.description || '',
    },
    {
      type: 'input',
      name: 'git_url',
      message: t('res.template.gitPrompt'),
      default: existing?.git_url,
      validate: (input) => {
        const trimmed = input.trim();
        if (!trimmed) return t('res.add.gitRequired');
        const gitUrlPattern = /^(https?:\/\/|git@)[\w\-.]+(:\d+)?(\/|:)[\w\-./]+\.git$/i;
        const githubPattern = /^https?:\/\/github\.com\/[\w\-]+\/[\w\-]+$/i;
        const gitlabPattern = /^https?:\/\/gitlab\.com\/[\w\-]+\/[\w\-]+$/i;
        if (!(gitUrlPattern.test(trimmed) || githubPattern.test(trimmed) || gitlabPattern.test(trimmed))) {
          return t('res.add.gitInvalid');
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'branch',
      message: t('res.template.branchPrompt'),
      default: existing?.branch || 'main',
    },
    {
      type: 'input',
      name: 'category',
      message: t('res.template.categoryPrompt'),
      default: existing?.category || '',
    },
    {
      type: 'input',
      name: 'tags',
      message: t('res.common.tagsPrompt'),
      default: currentTags,
    },
  ]);

  return {
    name: answers.name.trim(),
    description: answers.description.trim() || undefined,
    git_url: answers.git_url.trim(),
    branch: answers.branch.trim() || 'main',
    category: answers.category.trim() || undefined,
    tags: parseTagsInput(answers.tags || ''),
  };
}

export async function promptCreateTemplateInput(): Promise<CreateTemplateInput> {
  return await promptTemplateInput() as CreateTemplateInput;
}

export async function promptUpdateTemplateInput(existing: LocalTemplateResource): Promise<UpdateTemplateInput> {
  return await promptTemplateInput(existing) as UpdateTemplateInput;
}

export async function promptMultilineMarkdown(initialContent = ''): Promise<string> {
  console.log(chalk.dim(t('res.doc.multilineHint')));
  console.log(chalk.dim(t('res.doc.multilineEndHint')));
  if (initialContent) {
    console.log(chalk.dim(t('res.doc.currentContentHint')));
  }

  const lines: string[] = [];
  while (true) {
    const { line } = await inquirer.prompt([
      {
        type: 'input',
        name: 'line',
        message: lines.length === 0 ? t('res.doc.multilineFirstLinePrompt') : '',
      },
    ]);

    if (line === 'EOF') {
      break;
    }
    lines.push(line);
  }

  const content = lines.join('\n').trimEnd();
  if (content.length === 0 && initialContent) {
    return initialContent;
  }
  return content;
}

export async function promptDocInput(existing?: LocalDocResource): Promise<CreateDocInput | UpdateDocInput> {
  const currentTags = existing ? getStoredTags(existing).join(', ') : '';
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: t('res.doc.namePrompt'),
      default: existing?.name,
      validate: async (input) => {
        if (!input.trim()) return t('res.add.nameRequired');
        const duplicate = await ResourcesDAO.getByName(input.trim());
        if (duplicate && duplicate.id !== existing?.id) return t('res.add.nameExists');
        return true;
      },
    },
    {
      type: 'input',
      name: 'description',
      message: t('res.common.descriptionPrompt'),
      default: existing?.description || '',
    },
    {
      type: 'input',
      name: 'uri',
      message: t('res.doc.uriPrompt'),
      default: existing?.uri,
      validate: async (input) => {
        const trimmed = input.trim();
        if (!trimmed) return t('res.doc.uriRequired');
        const duplicate = await ResourcesDAO.getDocByUri(trimmed);
        if (duplicate && duplicate.id !== existing?.id) return t('res.doc.uriExists');
        return true;
      },
    },
    {
      type: 'input',
      name: 'tags',
      message: t('res.common.tagsPrompt'),
      default: currentTags,
    },
  ]);

  const content = await promptMultilineMarkdown(existing?.content || '');
  if (!content.trim()) {
    throw new Error(t('res.doc.contentRequired'));
  }

  return {
    name: answers.name.trim(),
    description: answers.description.trim() || undefined,
    uri: answers.uri.trim(),
    tags: parseTagsInput(answers.tags || ''),
    content,
    format: 'markdown',
  };
}

export async function promptCreateDocInput(): Promise<CreateDocInput> {
  return await promptDocInput() as CreateDocInput;
}

export async function promptUpdateDocInput(existing: LocalDocResource): Promise<UpdateDocInput> {
  return await promptDocInput(existing) as UpdateDocInput;
}

export function printDocPreview(doc: LocalDocResource, previewLines = 8): void {
  console.log(chalk.dim(`   ${t('common.id')}: ${doc.id}`));
  console.log(chalk.dim(`   URI: ${doc.uri}`));
  console.log(chalk.dim(`   ${t('common.description')}: ${doc.description || t('common.none')}`));
  console.log(chalk.dim(`   ${t('common.wordCount')}: ${doc.word_count}`));
  console.log();

  const lines = doc.content.split(/\r?\n/);
  const preview = lines.slice(0, previewLines).join('\n');
  console.log(preview || t('resList.docEmpty'));
  if (lines.length > previewLines) {
    console.log();
    console.log(chalk.dim(t('res.doc.previewTruncated', { count: lines.length - previewLines })));
  }
}
