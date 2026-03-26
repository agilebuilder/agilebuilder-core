/**
 * Pro 模块完整性校验
 *
 * 负责验证已下载的 Pro 模块文件完整性，以及本地 manifest 签名有效性。
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { getProModulesDir, getProModuleFilePath } from '../shared/paths.js';
import type { ProModuleMeta, SignedProModuleMeta } from '../shared/types.js';
import { verifySignedDataResponse } from '../license/signature.js';
import { t } from '../i18n/index.js';

export interface IntegrityCheckResult {
  valid: boolean;
  reason?: string;
  meta?: ProModuleMeta;
  recoveryHint?: string;
}

function getVersionFilePath(): string {
  return join(getProModulesDir(), 'version.json');
}

function readStoredManifest(): SignedProModuleMeta | null {
  const versionPath = getVersionFilePath();
  if (!existsSync(versionPath)) {
    return null;
  }

  try {
    const content = readFileSync(versionPath, 'utf-8');
    return JSON.parse(content) as SignedProModuleMeta;
  } catch {
    return null;
  }
}

function isLegacyVersionMeta(value: unknown): value is ProModuleMeta {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.version === 'string' &&
    typeof candidate.minCliVersion === 'string' &&
    typeof candidate.sha256 === 'string' &&
    typeof candidate.size === 'number' &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.features)
  );
}

export class ProIntegrity {
  static exists(): boolean {
    const modulePath = getProModuleFilePath();
    const versionPath = getVersionFilePath();
    return existsSync(modulePath) && existsSync(versionPath);
  }

  static getStoredManifest(): SignedProModuleMeta | null {
    return readStoredManifest();
  }

  static getMeta(): ProModuleMeta | null {
    const manifest = this.getStoredManifest();
    if (!manifest) {
      return null;
    }

    if (isLegacyVersionMeta(manifest)) {
      return null;
    }

    const verification = verifySignedDataResponse(manifest, {
      maxAgeMs: null,
    });
    if (!verification.valid) {
      return null;
    }

    return manifest.data;
  }

  static verify(): IntegrityCheckResult {
    const modulePath = getProModuleFilePath();
    const versionPath = getVersionFilePath();

    if (!existsSync(modulePath)) {
      return {
        valid: false,
        reason: t('pro.moduleFileMissing'),
      };
    }

    if (!existsSync(versionPath)) {
      return {
        valid: false,
        reason: t('pro.versionFileMissing'),
      };
    }

    const manifest = this.getStoredManifest();
    if (!manifest) {
      return {
        valid: false,
        reason: t('pro.versionFileCorrupted'),
        recoveryHint: t('pro.redownloadHint'),
      };
    }

    if (isLegacyVersionMeta(manifest)) {
      return {
        valid: false,
        reason: t('pro.legacyVersionFileDetected'),
        recoveryHint: t('pro.legacyVersionFileHint'),
      };
    }

    const manifestVerification = verifySignedDataResponse(manifest, {
      maxAgeMs: null,
    });
    if (!manifestVerification.valid) {
      return {
        valid: false,
        reason: t('pro.manifestSignatureInvalid'),
        recoveryHint: t('pro.redownloadHint'),
      };
    }

    try {
      const moduleContent = readFileSync(modulePath, 'utf-8');
      const actualHash = createHash('sha256').update(moduleContent).digest('hex');

      if (actualHash !== manifest.data.sha256) {
        return {
          valid: false,
          reason: t('pro.moduleCorrupted'),
          recoveryHint: t('pro.redownloadHint'),
        };
      }
    } catch {
      return {
        valid: false,
        reason: t('pro.moduleUnreadable'),
        recoveryHint: t('pro.redownloadHint'),
      };
    }

    return {
      valid: true,
      meta: manifest.data,
    };
  }

  static quickCheck(): IntegrityCheckResult {
    const modulePath = getProModuleFilePath();
    const versionPath = getVersionFilePath();

    if (!existsSync(modulePath)) {
      return {
        valid: false,
        reason: t('pro.moduleFileMissing'),
      };
    }

    if (!existsSync(versionPath)) {
      return {
        valid: false,
        reason: t('pro.versionFileMissing'),
      };
    }

    const meta = this.getMeta();
    if (!meta) {
      const manifest = this.getStoredManifest();
      if (manifest && isLegacyVersionMeta(manifest)) {
        return {
          valid: false,
          reason: t('pro.legacyVersionFileDetected'),
          recoveryHint: t('pro.legacyVersionFileHint'),
        };
      }

      return {
        valid: false,
        reason: t('pro.manifestSignatureInvalid'),
        recoveryHint: t('pro.redownloadHint'),
      };
    }

    return {
      valid: true,
      meta,
    };
  }
}
