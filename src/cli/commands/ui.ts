import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import { startServer } from '../../server/index.js';
import { UI_DEFAULT_PORT, UI_HOST } from '../../shared/constants.js';
import { t } from '../../i18n/index.js';

export const uiCommand = new Command('ui')
  .description(t('ui.command.description'))
  .option('-p, --port <port>', t('ui.command.portOption'), UI_DEFAULT_PORT.toString())
  .option('--no-open', t('ui.command.noOpenOption'))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const url = `http://${UI_HOST}:${port}`;
      console.log(chalk.cyan(t('ui.command.starting')));
      await startServer(port);
      console.log(chalk.green(`\n ${t('ui.command.runningAt', { url: chalk.bold(url) })}`));
      if (options.open !== false) {
        console.log(chalk.gray(t('ui.command.openingBrowser')));
        await open(url);
      }
      console.log(chalk.gray(`\n${t('ui.command.stopHint')}\n`));
    } catch (error) {
      console.error(chalk.red(`${t('common.error')}:`), error instanceof Error ? error.message : t('common.unknownError'));
      process.exit(1);
    }
  });
