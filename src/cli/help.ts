import { Command } from 'commander';
import { t } from '../i18n/index.js';

export type CommandLocalization = {
  arguments?: Array<{ syntax: string; descriptionKey: string }>;
  commandDescriptionKey?: string;
  options?: Array<{ flags: string; descriptionKey: string }>;
  subcommands?: Record<string, CommandLocalization>;
};

type HelpFormatterOptions = {
  includeArguments?: boolean;
};

function formatHelpSection(cmd: Command, helper: ReturnType<Command['createHelp']>, options?: HelpFormatterOptions): string {
  const termWidth = helper.padWidth(cmd, helper);
  const helpWidth = helper.helpWidth ?? 80;
  const itemIndentWidth = 2;
  const itemSeparatorWidth = 2;

  const formatItem = (term: string, description: string) => {
    const fullText = `${' '.repeat(itemIndentWidth)}${term.padEnd(termWidth)}${' '.repeat(itemSeparatorWidth)}${description}`;
    return helper.wrap(fullText, helpWidth - itemIndentWidth, termWidth + itemSeparatorWidth);
  };

  const sections: string[] = [];
  sections.push(`${t('common.usage')}: ${buildCommandUsage(cmd)}`);

  const description = cmd.description();
  if (description.length > 0) {
    sections.push(...description.split('\n'));
  }

  const argumentList = helper.visibleArguments(cmd);
  if (options?.includeArguments && argumentList.length > 0) {
    const argumentsSection = argumentList.map((argument) => formatItem(argument.name(), argument.description || ''));
    sections.push(`${t('common.arguments')}:\n${argumentsSection.join('\n')}`);
  }

  const optionList = helper.visibleOptions(cmd);
  if (optionList.length > 0) {
    const optionsSection = optionList.map((option) => formatItem(helper.optionTerm(option), option.description || ''));
    sections.push(`${t('common.options')}:\n${optionsSection.join('\n')}`);
  }

  const commandList = helper.visibleCommands(cmd).filter((subcommand) => {
    const primaryName = subcommand.name().split('|')[0];
    return primaryName !== 'help' && primaryName !== '--help';
  });
  if (commandList.length > 0) {
    const commandsSection = commandList.map((subcommand) => {
      const primaryName = subcommand.name().split('|')[0];
      const term = `${primaryName}${subcommand.usage() ? ` ${subcommand.usage()}` : ''}`;
      return formatItem(term, subcommand.description());
    });
    sections.push(`${t('common.commands')}:\n${commandsSection.join('\n')}`);
  }

  return sections.join('\n\n');
}

export function buildCommandUsage(cmd: Command): string {
  const names: string[] = [];
  let current: Command | null = cmd;

  while (current) {
    names.unshift(current.name().split('|')[0]);
    current = current.parent ?? null;
  }

  const usage = cmd.usage();
  if (usage) {
    names.push(usage);
  }

  return names.join(' ').trim();
}

export function buildLocalizedHelpFormatter(options?: HelpFormatterOptions) {
  return (cmd: Command, helper: ReturnType<Command['createHelp']>) => formatHelpSection(cmd, helper, options);
}

export function configureLocalizedHelp(command: Command, options?: HelpFormatterOptions): void {
  command.helpOption('-h, --help', t('common.displayHelp'));
  command.addHelpCommand(false);
  command.configureHelp({
    helpWidth: 100,
    commandUsage: buildCommandUsage,
    subcommandTerm: (cmd) => cmd.name().split('|')[0],
    commandDescription: (cmd) => cmd.description(),
    subcommandDescription: (cmd) => cmd.description(),
    optionDescription: (option) => option.description || '',
    formatHelp: buildLocalizedHelpFormatter(options),
  });
}

export function applyCommandLocalization(command: Command, localization: CommandLocalization): void {
  if (localization.commandDescriptionKey) {
    command.description(t(localization.commandDescriptionKey));
  }

  if (localization.options) {
    for (const optionConfig of localization.options) {
      const option = command.options.find((item) => item.flags === optionConfig.flags);
      if (option) {
        option.description = t(optionConfig.descriptionKey);
      }
    }
  }

  if (localization.arguments) {
    for (const argumentConfig of localization.arguments) {
      const argument = command.registeredArguments.find((item) => item.name() === argumentConfig.syntax);
      if (argument) {
        argument.description = t(argumentConfig.descriptionKey);
      }
    }
  }

  configureLocalizedHelp(command);

  if (localization.subcommands) {
    for (const subcommand of command.commands) {
      const key = subcommand.name().split('|')[0];
      const subcommandLocalization = localization.subcommands[key];
      if (subcommandLocalization) {
        applyCommandLocalization(subcommand, subcommandLocalization);
      }
    }
  }
}
