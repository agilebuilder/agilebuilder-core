import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getConfigFilePath } from '../shared/paths.js';
import { normalizeLanguage } from '../i18n/index.js';
import type { LanguageSetting } from '../shared/constants.js';

export type BackendProfile = 'auto' | 'china' | 'global';

export interface CliConfig {
  backend: {
    profile: BackendProfile;
  };
  language: LanguageSetting;
  template: {
    allowHooksDefault: boolean;
  };
}

const DEFAULT_CONFIG: CliConfig = {
  backend: {
    profile: 'auto',
  },
  language: 'auto',
  template: {
    allowHooksDefault: false,
  },
};

const CONFIG_PATHS = new Set([
  'backend.profile',
  'language',
  'template.allowHooksDefault',
]);

function normalizeBackendProfile(value: unknown): BackendProfile {
  if (value === 'china' || value === 'global' || value === 'auto') {
    return value;
  }
  throw new Error(`Invalid backend.profile: ${String(value)}`);
}

function requireBoolean(path: string, value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  throw new Error(`Invalid ${path}: expected boolean.`);
}

function normalizeConfig(value: unknown): CliConfig {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid config: expected object.');
  }

  const raw = value as Partial<CliConfig>;
  return {
    backend: {
      profile: normalizeBackendProfile(raw.backend?.profile),
    },
    language: normalizeLanguage(raw.language),
    template: {
      allowHooksDefault: requireBoolean('template.allowHooksDefault', raw.template?.allowHooksDefault),
    },
  };
}

function cloneDefaultConfig(): CliConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as CliConfig;
}

function requireKnownPath(path: string): void {
  if (!CONFIG_PATHS.has(path)) {
    throw new Error(`Unknown config key: ${path}`);
  }
}

function setByPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const current = cursor[part];
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

function getByPath(target: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cursor, part) => {
    if (!cursor || typeof cursor !== 'object') {
      return undefined;
    }
    return (cursor as Record<string, unknown>)[part];
  }, target);
}

function parseConfigValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

export class ConfigStore {
  static load(): CliConfig {
    const filePath = getConfigFilePath();
    if (!existsSync(filePath)) {
      return cloneDefaultConfig();
    }

    return normalizeConfig(JSON.parse(readFileSync(filePath, 'utf8')));
  }

  static save(config: CliConfig): void {
    const filePath = getConfigFilePath();
    mkdirSync(dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(normalizeConfig(config), null, 2)}\n`, 'utf8');
    renameSync(tempPath, filePath);
  }

  static get(path: string): unknown {
    requireKnownPath(path);
    return getByPath(this.load(), path);
  }

  static set(path: string, rawValue: string): CliConfig {
    requireKnownPath(path);
    const current = this.load();
    const mutable = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
    setByPath(mutable, path, parseConfigValue(rawValue));
    const normalized = normalizeConfig(mutable);
    this.save(normalized);
    return normalized;
  }
}
