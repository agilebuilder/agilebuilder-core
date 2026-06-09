import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version?: string };

export const APP_NAME = 'agilebuilder';
export const APP_SHORT_NAME = 'ag';
export const APP_VERSION = packageJson.version ?? '0.0.0';
export const CLIENT_TYPE = 'cli';

export const LOCAL_SPACE_ID = 'local';
export const LOCAL_SPACE_NAME_KEY = 'space.local.name';

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];
export type LanguageSetting = LocaleCode | 'auto';
