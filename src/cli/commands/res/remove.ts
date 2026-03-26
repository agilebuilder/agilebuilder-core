/**
 * res remove 命令 - 删除本地资源
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
import { promptResourceId } from './local-resource-utils.js';

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

export const removeCommand = new Command('remove')
  .alias('rm')
  .description(t('res.remove.description'))
  .option('-f, --force', t('res.remove.forceOption'))
  .action(async (options: { force?: boolean }) => {
    if (!checkLocalSpace()) {
      return;
    }

    try {
      const resourceId = await promptResourceId(t('res.remove.resourceIdPrompt'));
      if (!resourceId) {
        return;
      }

      const existing = await ResourcesDAO.getById(resourceId);
      if (!existing) {
        console.log(chalk.red(`\n${t('res.remove.notFoundById', { id: resourceId })}\n`));
        return;
      }

      if (!options.force) {
        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: t('res.remove.confirm', { name: existing.name }),
            default: false,
          },
        ]);

        if (!confirmed) {
          console.log(chalk.dim(`\n${t('resList.cancelled')}\n`));
          return;
        }
      }

      await ResourcesDAO.deleteById(resourceId);
      console.log(chalk.green(`\n${t('res.remove.success', { name: existing.name })}\n`));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('common.unknownError');
      console.log(chalk.red(`\n${t('res.remove.failed', { error: message })}\n`));
    }
  });
