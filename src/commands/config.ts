import { Command } from 'commander';
import { AppError } from '../errors/app-error.js';
import { ConfigStore } from '../config/store.js';
import { getEffectiveLocale, t } from '../i18n/index.js';
import { writeSuccess } from '../output/format.js';
import { renderConfigGet, renderConfigList, renderConfigSet } from '../output/cli-renderers.js';

interface JsonOption {
  json?: boolean;
}

export function createConfigCommand(): Command {
  const command = new Command('config')
    .description(t('config.description'));

  command
    .command('list')
    .description(t('config.list.description'))
    .option('--json', 'Output JSON')
    .action((options: JsonOption) => {
      writeSuccess(ConfigStore.load(), options, renderConfigList);
    });

  command
    .command('get')
    .argument('<key>')
    .description(t('config.get.description'))
    .option('--json', 'Output JSON')
    .action((key: string, options: JsonOption) => {
      if (!key) {
        throw new AppError({
          code: 'CONFIG_KEY_REQUIRED',
          message: t('config.keyRequired'),
          category: 'validation',
        });
      }
      writeSuccess({ key, value: ConfigStore.get(key) }, options, renderConfigGet);
    });

  command
    .command('set')
    .argument('<key>')
    .argument('<value>')
    .description(t('config.set.description'))
    .option('--json', 'Output JSON')
    .action((key: string, value: string, options: JsonOption) => {
      const config = ConfigStore.set(key, value);
      getEffectiveLocale(config.language);
      writeSuccess({ message: t('config.set.success'), config }, options, renderConfigSet);
    });

  return command;
}
