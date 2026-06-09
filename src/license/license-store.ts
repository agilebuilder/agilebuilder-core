import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getDataDir } from '../shared/paths.js';
import { AppError } from '../errors/app-error.js';
import { ClientApi, type LicenseResponse } from '../client/client-api.js';
import { TokenStore } from '../auth/token-store.js';
import { verifyLicenseSignature } from './signature.js';

const LICENSE_CACHE_TTL_MS = 60 * 60 * 1000;

function getLicenseFilePath(): string {
  return join(getDataDir(), 'license-cache.json');
}

export interface CachedLicense {
  fetchedAt: number;
  response: LicenseResponse;
}

export class LicenseStore {
  static load(): CachedLicense | null {
    const filePath = getLicenseFilePath();
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(filePath, 'utf8')) as CachedLicense;
    } catch {
      return null;
    }
  }

  static save(response: LicenseResponse): void {
    verifyLicenseSignature(response);
    const filePath = getLicenseFilePath();
    mkdirSync(dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify({ fetchedAt: Date.now(), response }, null, 2)}\n`, 'utf8');
    renameSync(tempPath, filePath);
  }

  static getValidCached(): LicenseResponse | null {
    const cached = this.load();
    if (!cached) {
      return null;
    }
    if (Date.now() - cached.fetchedAt > LICENSE_CACHE_TTL_MS) {
      return null;
    }
    return cached.response;
  }

  static async refresh(): Promise<LicenseResponse> {
    const token = await TokenStore.getValidToken();
    if (!token) {
      throw new AppError({ code: 'AUTH_TOKEN_UNAVAILABLE', message: 'Login is required to refresh license.', category: 'auth' });
    }
    const response = await ClientApi.getLicense(token);
    this.save(response);
    return response;
  }

  static async getOrRefresh(force = false): Promise<LicenseResponse | null> {
    if (!force) {
      const cached = this.getValidCached();
      if (cached) return cached;
    }
    const token = await TokenStore.getValidToken();
    if (!token) {
      return null;
    }
    return this.refresh();
  }
}
