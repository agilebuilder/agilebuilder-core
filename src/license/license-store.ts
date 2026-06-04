import { createVerify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getDataDir } from '../shared/paths.js';
import { AppError } from '../errors/app-error.js';
import { ClientApi, type LicenseResponse } from '../client/client-api.js';
import { TokenStore } from '../auth/token-store.js';

const LICENSE_CACHE_TTL_MS = 60 * 60 * 1000;

// TODO: Replace this placeholder with the server public key before enabling strict verification.
const LICENSE_PUBLIC_KEY = process.env.AGILEBUILDER_LICENSE_PUBLIC_KEY || '';

function getLicenseFilePath(): string {
  return join(getDataDir(), 'license-cache.json');
}

export interface CachedLicense {
  fetchedAt: number;
  response: LicenseResponse;
}

function verifySignature(response: LicenseResponse): void {
  if (!LICENSE_PUBLIC_KEY) {
    return;
  }
  if (response.signature.algorithm !== 'RS256') {
    throw new AppError({ code: 'LICENSE_ALGORITHM_UNSUPPORTED', message: 'Unsupported license signature algorithm.', category: 'permission' });
  }
  const verifier = createVerify('RSA-SHA256');
  verifier.update(response.signature.payload);
  const valid = verifier.verify(LICENSE_PUBLIC_KEY, response.signature.sign, 'base64');
  if (!valid) {
    throw new AppError({ code: 'LICENSE_SIGNATURE_INVALID', message: 'License signature is invalid.', category: 'permission' });
  }
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
    verifySignature(response);
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
