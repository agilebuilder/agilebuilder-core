#!/usr/bin/env node
import { Command } from 'commander';
import { APP_NAME, APP_VERSION } from '../shared/constants.js';
import { createConfigCommand } from '../commands/config.js';
import { createCreateCommand } from '../commands/create.js';
import { createAuthCommand, createLoginCommand, createLogoutCommand } from '../commands/auth.js';
import { createDeviceCommand } from '../commands/device.js';
import { createMcpDebugResourcesCommand } from '../commands/mcp-debug-resources.js';
import { createResCommand } from '../commands/res.js';
import { createSpaceCommand } from '../commands/space.js';
import { getEffectiveLocale, t } from '../i18n/index.js';
import { ConfigStore } from '../config/store.js';
import { getBackendEndpoints } from '../client/backend.js';
import { printError } from '../output/format.js';

async function main(): Promise<void> {
  const config = ConfigStore.load();
  getEffectiveLocale(config.language);
  const { websiteUrl } = getBackendEndpoints();

  const program = new Command();
  program
    .name(APP_NAME)
    .description(t('cli.description', { websiteUrl }))
    .version(APP_VERSION, '-V, --version', t('common.outputVersion'))
    .helpOption('-h, --help', t('common.displayHelp'));
  program.addHelpCommand('help [command]', t('common.helpCommandDescription'));

  program.addCommand(createConfigCommand());
  program.addCommand(createLoginCommand());
  program.addCommand(createLogoutCommand());
  program.addCommand(createAuthCommand());
  program.addCommand(createSpaceCommand());
  program.addCommand(createResCommand());
  program.addCommand(createCreateCommand());
  program.addCommand(createDeviceCommand());
  program.addCommand(createMcpDebugResourcesCommand(), { hidden: true });

  program.showHelpAfterError();
  await program.parseAsync(process.argv);
}

main().catch((error) => {
  printError(error, { json: process.argv.includes('--json') });
  process.exit(1);
});
