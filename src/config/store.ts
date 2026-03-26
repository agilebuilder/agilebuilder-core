import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { getCliConfigFilePath } from '../shared/paths.js';
import { type BackendProfile, type BackendProfileSetting } from './backend-profiles.js';
import type { LocaleCode } from '../i18n/index.js';

export type CliLanguageSetting = 'auto' | LocaleCode;

export interface CliConfig {
  language: CliLanguageSetting;
  backendProfile: BackendProfileSetting;
  resolvedBackendProfile: BackendProfile;
}

const DEFAULT_CONFIG: CliConfig = {
  language: 'auto',
  backendProfile: 'auto',
  resolvedBackendProfile: 'china',
};

const CHINA_TIMEZONES = new Set([
  'asia/shanghai',
  'asia/chongqing',
  'asia/harbin',
  'asia/urumqi',
]);

function isBackendProfile(value: unknown): value is BackendProfile {
  return value === 'china' || value === 'global';
}

function isBackendProfileSetting(value: unknown): value is BackendProfileSetting {
  return value === 'auto' || isBackendProfile(value);
}

function detectBackendProfileFromSystem(): BackendProfile {
  const localeCandidates = [
    process.env.AGILEBUILDER_LOCALE,
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG,
    Intl.DateTimeFormat().resolvedOptions().locale,
  ];

  for (const candidate of localeCandidates) {
    if (typeof candidate === 'string' && candidate.toLowerCase().startsWith('zh-cn')) {
      return 'china';
    }
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (typeof timezone === 'string' && CHINA_TIMEZONES.has(timezone.toLowerCase())) {
    return 'china';
  }

  return 'global';
}

function normalizeConfig(value: unknown): CliConfig {
  if (!value || typeof value !== 'object') {
    return {
      ...DEFAULT_CONFIG,
      resolvedBackendProfile: detectBackendProfileFromSystem(),
    };
  }

  const config = value as Partial<CliConfig>;
  const language = config.language;
  const backendProfile = config.backendProfile;
  const resolvedBackendProfile = config.resolvedBackendProfile;
  const normalizedLanguage = language === 'zh-CN' || language === 'en-US' || language === 'auto'
    ? language
    : DEFAULT_CONFIG.language;
  const normalizedBackendProfile = isBackendProfileSetting(backendProfile)
    ? backendProfile
    : DEFAULT_CONFIG.backendProfile;
  const normalizedResolvedBackendProfile = isBackendProfile(resolvedBackendProfile)
    ? resolvedBackendProfile
    : detectBackendProfileFromSystem();

  return {
    language: normalizedLanguage,
    backendProfile: normalizedBackendProfile,
    resolvedBackendProfile: normalizedResolvedBackendProfile,
  };
}

export class CliConfigStore {
  static load(): CliConfig {
    const configFile = getCliConfigFilePath();

    if (!existsSync(configFile)) {
      return normalizeConfig(null);
    }

    try {
      const content = readFileSync(configFile, 'utf-8');
      if (!content.trim()) {
        return normalizeConfig(null);
      }

      return normalizeConfig(JSON.parse(content));
    } catch {
      return normalizeConfig(null);
    }
  }

  static save(config: CliConfig): void {
    const configFile = getCliConfigFilePath();
    const dir = dirname(configFile);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(configFile, `${JSON.stringify(normalizeConfig(config), null, 2)}\n`, 'utf-8');
  }

  static getLanguage(): CliLanguageSetting {
    return this.load().language;
  }

  static setLanguage(language: CliLanguageSetting): void {
    const config = this.load();
    this.save({
      ...config,
      language,
    });
  }

  static getBackendProfileSetting(): BackendProfileSetting {
    return this.load().backendProfile;
  }

  static getResolvedBackendProfile(): BackendProfile {
    const config = this.load();
    return config.backendProfile === 'auto'
      ? config.resolvedBackendProfile
      : config.backendProfile;
  }

  static setBackendProfileSetting(backendProfile: BackendProfileSetting): void {
    const config = this.load();
    this.save({
      ...config,
      backendProfile,
    });
  }

  static initializeBackendProfileIfNeeded(): CliConfig {
    const config = this.load();
    const nextConfig: CliConfig = {
      ...config,
      resolvedBackendProfile: config.resolvedBackendProfile,
    };

    if (!existsSync(getCliConfigFilePath())) {
      this.save(nextConfig);
    }

    return nextConfig;
  }
}
