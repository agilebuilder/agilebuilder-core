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
  mcp: {
    spaceIsolation: boolean;
  };
  template: {
    allowHooksDefault: boolean;
  };
}

const DEFAULT_CONFIG: CliConfig = {
  backend: {
    profile: 'auto',
  },
  language: 'auto',
  mcp: {
    spaceIsolation: true,
  },
  template: {
    allowHooksDefault: false,
  },
};

function normalizeBackendProfile(value: unknown): BackendProfile {
  return value === 'china' || value === 'global' || value === 'auto' ? value : 'auto';
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeConfig(value: unknown): CliConfig {
  if (!value || typeof value !== 'object') {
    return DEFAULT_CONFIG;
  }

  const raw = value as Partial<CliConfig>;
  return {
    backend: {
      profile: normalizeBackendProfile(raw.backend?.profile),
    },
    language: normalizeLanguage(raw.language),
    mcp: {
      spaceIsolation: normalizeBoolean(raw.mcp?.spaceIsolation, true),
    },
    template: {
      allowHooksDefault: normalizeBoolean(raw.template?.allowHooksDefault, false),
    },
  };
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
      return DEFAULT_CONFIG;
    }

    try {
      return normalizeConfig(JSON.parse(readFileSync(filePath, 'utf8')));
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  static save(config: CliConfig): void {
    const filePath = getConfigFilePath();
    mkdirSync(dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(normalizeConfig(config), null, 2)}\n`, 'utf8');
    renameSync(tempPath, filePath);
  }

  static get(path: string): unknown {
    return getByPath(this.load(), path);
  }

  static set(path: string, rawValue: string): CliConfig {
    const current = this.load();
    const mutable = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
    setByPath(mutable, path, parseConfigValue(rawValue));
    const normalized = normalizeConfig(mutable);
    this.save(normalized);
    return normalized;
  }
}
