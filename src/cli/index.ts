#!/usr/bin/env node

/**
 * AgileBuilder CLI entry point.
 */

// Load env vars before importing modules that may depend on them.
import { config } from 'dotenv';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const currentFilePath = fileURLToPath(import.meta.url);
const __dirname = dirname(currentFilePath);
const rootDir = join(__dirname, '..', '..');

// Prefer .env.local over .env.
const envLocalPath = join(rootDir, '.env.local');
const envPath = join(rootDir, '.env');

if (existsSync(envLocalPath)) {
  config({ path: envLocalPath, quiet: true });
} else if (existsSync(envPath)) {
  config({ path: envPath, quiet: true });
}

import { Command } from 'commander';
import { APP_NAME, APP_VERSION } from '../shared/constants.js';
import { initDatabase } from '../db/index.js';
import { uiCommand } from './commands/ui.js';
import { loginCommand, logoutCommand, statusCommand } from './commands/auth/index.js';
import { configCommand } from './commands/config.js';
import { spaceCommand } from './commands/space.js';
import { proCommand } from './commands/pro.js';
import { deviceCommand } from './commands/device.js';
import { mcpDebugResourcesCommand } from './commands/mcp-debug-resources.js';
import { resCommand } from './commands/res/index.js';
import { checkCliVersion } from './version-check.js';
import { ProChecker } from '../pro-loader/checker.js';
import { getEffectiveLocale, setLocale, t } from '../i18n/index.js';
import { CliConfigStore } from '../config/store.js';
import { isLoggedIn, TokenStore } from '../auth/index.js';
import { applyCommandLocalization, configureLocalizedHelp } from './help.js';
import { getCliInitMarkerFilePath, getDataDir } from '../shared/paths.js';

type TopLevelCommandEntry = {
  command: Command;
  description: () => string;
  hidden?: boolean;
  name: string;
};

function getTopLevelVisibleCommands(loggedIn: boolean): TopLevelCommandEntry[] {
  return [
    {
      command: loggedIn ? logoutCommand : loginCommand,
      description: () => loggedIn ? t('auth.logout.description') : t('auth.command.description'),
      name: loggedIn ? 'logout' : 'login',
    },
    {
      command: spaceCommand,
      description: () => t('space.description'),
      name: 'space',
    },
    {
      command: resCommand,
      description: () => t('res.command.description'),
      name: 'res',
    },
    {
      command: uiCommand,
      description: () => t('ui.command.description'),
      name: 'ui',
    },
    {
      command: configCommand,
      description: () => t('config.description'),
      name: 'config',
    },
  ];
}

function renderRootHelp(loginStatusText: string, loggedIn: boolean): string {
  const commandEntries = getTopLevelVisibleCommands(loggedIn).map((item) => ({
    description: item.description(),
    name: item.name,
  }));

  const commandWidth = Math.max(...commandEntries.map((item) => item.name.length)) + 2;
  const optionEntries = [
    { flags: '-V, --version', description: t('common.outputVersion') },
    { flags: '-h, --help', description: t('common.displayHelp') },
  ];
  const optionWidth = Math.max(...optionEntries.map((item) => item.flags.length)) + 2;

  const lines = [
    `${t('common.usage')}: ${APP_NAME}`,
    '',
    t('cli.description'),
    '',
    loginStatusText,
    '',
    `${t('common.options')}:`,
    ...optionEntries.map((item) => `  ${item.flags.padEnd(optionWidth)}${item.description}`),
    '',
    `${t('common.commands')}:`,
    ...commandEntries.map((item) => `  ${item.name.padEnd(commandWidth)}${item.description}`),
  ];

  return lines.join('\n');
}

function refreshTopLevelCommandDescriptions(): void {
  loginCommand.description(t('auth.command.description'));
  logoutCommand.description(t('auth.logout.description'));
  statusCommand.description(t('auth.status.description'));
  spaceCommand.description(t('space.description'));
  resCommand.description(t('res.command.description'));
  uiCommand.description(t('ui.command.description'));
  configCommand.description(t('config.description'));
  proCommand.description(t('pro.description'));
  deviceCommand.description(t('device.description'));
}

function refreshLocalizedCommandTree(): void {
  applyCommandLocalization(loginCommand, {
    commandDescriptionKey: 'auth.command.description',
  });

  applyCommandLocalization(logoutCommand, {
    commandDescriptionKey: 'auth.logout.description',
  });

  applyCommandLocalization(statusCommand, {
    commandDescriptionKey: 'auth.status.description',
  });

  applyCommandLocalization(spaceCommand, {
    commandDescriptionKey: 'space.description',
    subcommands: {
      list: {
        commandDescriptionKey: 'space.listDescription',
      },
      current: {
        commandDescriptionKey: 'space.currentDescription',
      },
    },
  });

  applyCommandLocalization(resCommand, {
    commandDescriptionKey: 'res.command.description',
    subcommands: {
      add: {
        commandDescriptionKey: 'res.add.description',
      },
      edit: {
        commandDescriptionKey: 'res.edit.description',
      },
      list: {
        commandDescriptionKey: 'resList.description',
        options: [
          { flags: '--offline', descriptionKey: 'resList.offlineOption' },
        ],
      },
      remove: {
        commandDescriptionKey: 'res.remove.description',
        options: [
          { flags: '-f, --force', descriptionKey: 'res.remove.forceOption' },
        ],
      },
    },
  });

  configureLocalizedHelp(resCommand, { includeArguments: true });

  applyCommandLocalization(uiCommand, {
    commandDescriptionKey: 'ui.command.description',
    options: [
      { flags: '-p, --port <port>', descriptionKey: 'ui.command.portOption' },
      { flags: '--no-open', descriptionKey: 'ui.command.noOpenOption' },
    ],
  });

  applyCommandLocalization(deviceCommand, {
    commandDescriptionKey: 'device.description',
    subcommands: {
      list: {
        commandDescriptionKey: 'device.listDescription',
      },
      revoke: {
        commandDescriptionKey: 'device.revokeDescription',
      },
      'revoke-all': {
        commandDescriptionKey: 'device.revokeAllDescription',
      },
    },
  });

  applyCommandLocalization(proCommand, {
    commandDescriptionKey: 'pro.description',
    subcommands: {
      info: {
        commandDescriptionKey: 'pro.menu.info',
      },
      load: {
        commandDescriptionKey: 'pro.menu.load',
      },
      unload: {
        commandDescriptionKey: 'pro.menu.unload',
      },
      update: {
        commandDescriptionKey: 'pro.menu.updateDescription',
      },
      verify: {
        commandDescriptionKey: 'pro.menu.verify',
      },
    },
  });
}

async function ensureFirstRunInitialization(): Promise<boolean> {
  const markerFile = getCliInitMarkerFilePath();
  mkdirSync(getDataDir(), { recursive: true });
  const isFirstRun = !existsSync(markerFile);

  if (isFirstRun) {
    console.log(t('cli.init.firstRunLoading'));
  }

  await initDatabase();

  if (!isFirstRun) {
    return false;
  }

  writeFileSync(markerFile, `${new Date().toISOString()}\n`, 'utf-8');

  console.log(t('cli.init.firstRunDone'));

  return true;
}

function launchBackgroundStartupTasks(): void {
  try {
    const child = spawn(process.execPath, [currentFilePath, '__startup-check'], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        AGILEBUILDER_BACKGROUND_STARTUP: '1',
      },
    });

    child.unref();
  } catch {
    // Background warmup failures must not affect foreground execution.
  }
}

async function runBackgroundStartupTasks(): Promise<void> {
  setLocale(getEffectiveLocale(CliConfigStore.load().language));
  await ProChecker.runStartupCheck({ silent: true, autoDownload: true });
}

async function main() {
  const cliConfig = CliConfigStore.initializeBackendProfileIfNeeded();
  setLocale(getEffectiveLocale(cliConfig.language));
  refreshTopLevelCommandDescriptions();
  refreshLocalizedCommandTree();

  const args = process.argv.slice(2);
  if (process.env.AGILEBUILDER_BACKGROUND_STARTUP === '1' && args[0] === '__startup-check') {
    await runBackgroundStartupTasks();
    process.exit(0);
  }

  const argsLength = args.length;
  const helpRequested = args.includes('--help') || args.includes('-h');
  const versionRequested = args.includes('--version') || args.includes('-V');
  const rootHelpRequested = argsLength === 1 && helpRequested;
  const shouldValidateSessionForDisplay = argsLength === 0 || rootHelpRequested;
  const loggedIn = shouldValidateSessionForDisplay
    ? await TokenStore.hasValidSession()
    : isLoggedIn();
  const currentUser = loggedIn ? TokenStore.getUser() : null;
  const loginStatusText = loggedIn
    ? currentUser?.name
      ? `${t('common.status')}: ${t('auth.status.loggedInWithName', { name: currentUser.name })}`
      : `${t('common.status')}: ${t('auth.status.loggedInText')}`
    : `${t('common.status')}: ${t('auth.status.notLoggedInText')}`;

  if (argsLength === 0 || rootHelpRequested) {
    console.log(renderRootHelp(loginStatusText, loggedIn));
    process.exit(0);
  }

  if (!helpRequested && !versionRequested) {
    await ensureFirstRunInitialization();

    const canContinue = await checkCliVersion();
    if (!canContinue) {
      process.exit(1);
    }

    launchBackgroundStartupTasks();
  }

  const program = new Command();

  program
    .name(APP_NAME)
    .description(t('cli.description'));

  program
    .helpOption('-h, --help', t('common.displayHelp'))
    .version(APP_VERSION, '-V, --version', t('common.outputVersion'));

  for (const entry of getTopLevelVisibleCommands(loggedIn)) {
    program.addCommand(entry.command, { hidden: entry.hidden ?? false });
  }

  program.addCommand(loggedIn ? loginCommand : logoutCommand, { hidden: true });
  program.addCommand(statusCommand, { hidden: true });
  program.addCommand(proCommand, { hidden: true });
  program.addCommand(deviceCommand, { hidden: true });
  program.addCommand(mcpDebugResourcesCommand, { hidden: true });

  program.parse();
}

main().catch((error) => {
  console.error(`${t('common.error')}:`, error instanceof Error ? error.message : t('common.unknownError'));
  process.exit(1);
});
