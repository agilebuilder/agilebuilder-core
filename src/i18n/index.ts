import { SUPPORTED_LOCALES, type LanguageSetting, type LocaleCode } from '../shared/constants.js';
import { messages } from './messages.js';

let currentLocale: LocaleCode = 'en-US';

function isLocale(value: string | undefined): value is LocaleCode {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function detectLocale(): LocaleCode {
  const candidates = [
    process.env.AGILEBUILDER_LANG,
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG,
    Intl.DateTimeFormat().resolvedOptions().locale,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = candidate.replace('_', '-');
    if (normalized.toLowerCase().startsWith('zh')) {
      return 'zh-CN';
    }
    if (normalized.toLowerCase().startsWith('en')) {
      return 'en-US';
    }
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone?.toLowerCase();
  if (
    timezone === 'asia/shanghai'
    || timezone === 'asia/chongqing'
    || timezone === 'asia/harbin'
    || timezone === 'asia/urumqi'
  ) {
    return 'zh-CN';
  }

  return 'en-US';
}

export function getEffectiveLocale(setting: LanguageSetting = 'auto'): LocaleCode {
  currentLocale = setting === 'auto' ? detectLocale() : setting;
  return currentLocale;
}

export function setLocale(locale: LocaleCode): void {
  currentLocale = locale;
}

export function t(key: string, vars: Record<string, string | number | undefined> = {}): string {
  const template = messages[currentLocale][key];
  if (!template) {
    throw new Error(`Missing i18n message "${key}" for locale ${currentLocale}.`);
  }
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name];
    return value === undefined ? '' : String(value);
  });
}

export function normalizeLanguage(value: unknown): LanguageSetting {
  if (value === 'auto' || isLocale(typeof value === 'string' ? value : undefined)) {
    return value as LanguageSetting;
  }
  throw new Error(`Invalid language setting: ${String(value)}`);
}
