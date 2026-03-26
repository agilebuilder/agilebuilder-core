/**
 * res add 命令 - 添加本地资源
 *
 * 仅在本地空间可用
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { SpaceManager } from '../../../license/index.js';
import { ResourcesDAO } from '../../../db/dao/resources.dao.js';
import { LOCAL_SPACE_ID } from '../../../shared/constants.js';
import { t } from '../../../i18n/index.js';
import { promptCreateDocInput, promptCreateTemplateInput } from './local-resource-utils.js';

/**
 * 检查是否在本地空间
 */
function checkLocalSpace(): boolean {
  const currentSpace = SpaceManager.getCurrentSpace();
  if (!currentSpace || currentSpace.spaceId !== LOCAL_SPACE_ID) {
    console.log(chalk.yellow(`\n${t('res.localOnlyUnavailable')}`));
    console.log(chalk.dim(`${t('res.switchToLocalHint')}\n`));
    return false;
  }
  return true;
}

export const addCommand = new Command('add')
  .description(t('res.add.description'))
  .action(async () => {
    if (!checkLocalSpace()) {
      return;
    }

    try {
      console.log(chalk.cyan(`\n${t('res.add.title')}\n`));

      const { resourceType } = await inquirer.prompt([
        {
          type: 'select',
          name: 'resourceType',
          message: t('res.add.typePrompt'),
          choices: [
            { name: t('common.template'), value: 'template' },
            { name: t('common.document'), value: 'doc' },
          ],
        }
      ]);

      if (resourceType === 'template') {
        const input = await promptCreateTemplateInput();
        const template = await ResourcesDAO.createTemplate(input);
        console.log(chalk.green(`\n${t('res.add.success', { name: template.name })}`));
        console.log(chalk.dim(`${t('common.id')}: ${template.id}\n`));
        return;
      }

      const input = await promptCreateDocInput();
      const doc = await ResourcesDAO.createDoc(input);
      console.log(chalk.green(`\n${t('res.add.success', { name: doc.name })}`));
      console.log(chalk.dim(`${t('common.id')}: ${doc.id}`));
      console.log(chalk.dim(`URI: ${doc.uri}\n`));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('common.unknownError');
      console.log(chalk.red(`\n${t('res.add.failed', { error: message })}\n`));
    }
  });
