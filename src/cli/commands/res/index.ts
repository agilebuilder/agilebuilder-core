/**
 * res 命令 - 资源管理
 *
 * 浏览和操作当前空间下的资源
 * 支持本地空间和云端空间
 */

import { Command } from 'commander';
import { listCommand } from './list.js';
import { addCommand } from './add.js';
import { editCommand } from './edit.js';
import { removeCommand } from './remove.js';
import { t } from '../../../i18n/index.js';
import { configureLocalizedHelp } from '../../help.js';

function renderResHelp(): string {
  const commandEntries = [
    { name: 'list', description: t('resList.description') },
    { name: 'add', description: t('res.add.description') },
    { name: 'edit', description: t('res.edit.description') },
    { name: 'remove', description: t('res.remove.description') },
  ];
  const commandWidth = Math.max(...commandEntries.map((item) => item.name.length)) + 2;

  const optionEntries = [
    { flags: '-h, --help', description: t('common.displayHelp') },
  ];
  const optionWidth = Math.max(...optionEntries.map((item) => item.flags.length)) + 2;

  const lines = [
    `${t('common.usage')}: agilebuilder res [options] [command]`,
    '',
    t('res.command.description'),
    '',
    `${t('common.options')}:`,
    ...optionEntries.map((item) => `  ${item.flags.padEnd(optionWidth)}${item.description}`),
    '',
    `${t('common.commands')}:`,
    ...commandEntries.map((item) => `  ${item.name.padEnd(commandWidth)}${item.description}`),
  ];

  return lines.join('\n');
}

export const resCommand = new Command('res')
  .alias('resource')
  .description(t('res.command.description'))
  .action(function (this: Command) {
    console.log(renderResHelp());
  })
  .addCommand(listCommand)
  .addCommand(addCommand)
  .addCommand(editCommand)
  .addCommand(removeCommand);

configureLocalizedHelp(resCommand);
