import { Command } from 'commander';
import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import type { BackendProfile, BackendProfileSetting } from '../../config/backend-profiles.js';
import { CliConfigStore, type CliLanguageSetting } from '../../config/store.js';
import { getEffectiveLocale, setLocale, t, type LocaleCode } from '../../i18n/index.js';

const LANGUAGE_CHOICES: Array<{
  value: CliLanguageSetting;
  descriptionKey: string;
}> = [
  {
    value: 'auto',
    descriptionKey: 'config.language.optionAutoDescription',
  },
  {
    value: 'zh-CN',
    descriptionKey: 'config.language.optionZhCNDescription',
  },
  {
    value: 'en-US',
    descriptionKey: 'config.language.optionEnUSDescription',
  },
];

const BACKEND_PROFILE_CHOICES: Array<{
  value: BackendProfileSetting;
  descriptionKey: string;
}> = [
  {
    value: 'auto',
    descriptionKey: 'config.backend.optionAutoDescription',
  },
  {
    value: 'china',
    descriptionKey: 'config.backend.optionChinaDescription',
  },
  {
    value: 'global',
    descriptionKey: 'config.backend.optionGlobalDescription',
  },
];

function getLanguageLabel(language: CliLanguageSetting): string {
  switch (language) {
    case 'auto':
      return t('config.language.optionAuto');
    case 'zh-CN':
      return t('config.language.optionZhCN');
    case 'en-US':
      return t('config.language.optionEnUS');
    default:
      return String(language);
  }
}

function getLocaleLabel(locale: LocaleCode): string {
  return locale === 'zh-CN' ? t('config.language.optionZhCN') : t('config.language.optionEnUS');
}

function getBackendProfileLabel(profile: BackendProfileSetting | BackendProfile): string {
  switch (profile) {
    case 'auto':
      return t('config.backend.optionAuto');
    case 'china':
      return t('config.backend.optionChina');
    case 'global':
      return t('config.backend.optionGlobal');
    default:
      return String(profile);
  }
}

async function configureLanguage(): Promise<void> {
  const currentSetting = CliConfigStore.getLanguage();
  const currentEffectiveLocale = getEffectiveLocale(currentSetting);

  console.log();
  console.log(chalk.bold(t('config.language.title')));
  console.log(`  ${t('config.language.currentSetting', { setting: getLanguageLabel(currentSetting) })}`);
  console.log(`  ${t('config.language.currentEffective', { locale: getLocaleLabel(currentEffectiveLocale) })}`);
  console.log();

  const selected = await select<CliLanguageSetting>({
    message: t('config.language.selectPrompt'),
    choices: LANGUAGE_CHOICES.map((choice) => ({
      value: choice.value,
      name: getLanguageLabel(choice.value),
      description: t(choice.descriptionKey),
    })),
  });

  CliConfigStore.setLanguage(selected);
  const nextLocale = getEffectiveLocale(selected);
  setLocale(nextLocale);

  console.log();
  console.log(chalk.green(t('config.saved')));
  console.log(`  ${t('config.language.savedSetting', { setting: getLanguageLabel(selected) })}`);
  console.log(`  ${t('config.language.savedEffective', { locale: getLocaleLabel(nextLocale) })}`);
  console.log();
}

async function configureBackendProfile(): Promise<void> {
  const currentSetting = CliConfigStore.getBackendProfileSetting();
  const currentEffectiveProfile = CliConfigStore.getResolvedBackendProfile();

  console.log();
  console.log(chalk.bold(t('config.backend.title')));
  console.log(`  ${t('config.backend.currentSetting', { setting: getBackendProfileLabel(currentSetting) })}`);
  console.log(`  ${t('config.backend.currentEffective', { profile: getBackendProfileLabel(currentEffectiveProfile) })}`);
  console.log();

  const selected = await select<BackendProfileSetting>({
    message: t('config.backend.selectPrompt'),
    choices: BACKEND_PROFILE_CHOICES.map((choice) => ({
      value: choice.value,
      name: getBackendProfileLabel(choice.value),
      description: t(choice.descriptionKey),
    })),
  });

  CliConfigStore.setBackendProfileSetting(selected);
  const nextEffectiveProfile = CliConfigStore.getResolvedBackendProfile();

  console.log();
  console.log(chalk.green(t('config.saved')));
  console.log(`  ${t('config.backend.savedSetting', { setting: getBackendProfileLabel(selected) })}`);
  console.log(`  ${t('config.backend.savedEffective', { profile: getBackendProfileLabel(nextEffectiveProfile) })}`);
  console.log();
}

export const configCommand = new Command('config')
  .description(t('config.description'))
  .action(async () => {
    const currentSetting = CliConfigStore.getLanguage();
    const currentEffectiveLocale = getEffectiveLocale(currentSetting);
    const currentBackendSetting = CliConfigStore.getBackendProfileSetting();
    const currentEffectiveBackendProfile = CliConfigStore.getResolvedBackendProfile();

    console.log();
    console.log(chalk.bold(t('config.title')));
    console.log(`  ${t('config.language.summary', {
      setting: getLanguageLabel(currentSetting),
      locale: getLocaleLabel(currentEffectiveLocale),
    })}`);
    console.log(`  ${t('config.backend.summary', {
      setting: getBackendProfileLabel(currentBackendSetting),
      profile: getBackendProfileLabel(currentEffectiveBackendProfile),
    })}`);
    console.log();

    const action = await select<string>({
      message: t('config.selectPrompt'),
      choices: [
        {
          value: 'language',
          name: t('config.language.menu'),
          description: t('config.language.menuDescription'),
        },
        {
          value: 'backend',
          name: t('config.backend.menu'),
          description: t('config.backend.menuDescription'),
        },
        {
          value: 'exit',
          name: t('config.exit'),
        },
      ],
    });

    if (action === 'language') {
      await configureLanguage();
    }

    if (action === 'backend') {
      await configureBackendProfile();
    }
  });
