/**
 * res edit 命令 - 编辑本地资源
 *
 * 仅在本地空间可用
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { SpaceManager } from '../../../license/index.js';
import { ResourcesDAO } from '../../../db/dao/resources.dao.js';
import { LOCAL_SPACE_ID } from '../../../shared/constants.js';
import { t } from '../../../i18n/index.js';
import {
  promptResourceId,
  promptUpdateDocInput,
  promptUpdateTemplateInput,
} from './local-resource-utils.js';

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

export const editCommand = new Command('edit')
  .description(t('res.edit.description'))
  .action(async () => {
    if (!checkLocalSpace()) {
      return;
    }

    try {
      const resourceId = await promptResourceId(t('res.edit.resourceIdPrompt'));
      if (!resourceId) {
        return;
      }

      const existing = await ResourcesDAO.getDetailById(resourceId);
      if (!existing) {
        console.log(chalk.red(`\n${t('res.edit.notFoundById', { id: resourceId })}\n`));
        return;
      }

      console.log(chalk.cyan(`\n${t('res.edit.title', { name: existing.name })}\n`));

      const updated = existing.type === 'template'
        ? await ResourcesDAO.updateTemplate(resourceId, await promptUpdateTemplateInput(existing))
        : await ResourcesDAO.updateDoc(resourceId, await promptUpdateDocInput(existing));

      console.log(chalk.green(`\n${t('res.edit.success', { name: updated.name })}\n`));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('common.unknownError');
      console.log(chalk.red(`\n${t('res.edit.failed', { error: message })}\n`));
    }
  });
