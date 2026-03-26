/**
 * License 存储和验证
 *
 * - 从服务端获取签名后的 License 数据
 * - 本地加密存储
 * - 严格执行签名、设备、客户端类型与过期校验
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'crypto';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
} from 'fs';
import { dirname } from 'path';
import { homedir } from 'os';
import { CLIENT_TYPE } from '../shared/constants.js';
import { getLicenseFilePath } from '../shared/paths.js';
import { getDeviceId } from './device.js';
import { verifyLicenseResponse } from './signature.js';
import type {
  LicenseData,
  LicenseResponse,
  SignedClaims,
  SpaceInfo,
} from '../shared/types.js';

function deriveKey(): Buffer {
  const deviceId = getDeviceId();
  const machineId = `${homedir()}:${process.platform}:${process.arch}`;
  return createHash('sha256')
    .update(`agilebuilder:license:${machineId}:${deviceId}`)
    .digest();
}

export interface LicenseValidationResult {
  valid: boolean;
  error?: string;
  claims?: SignedClaims<LicenseData>;
}

export interface LicenseValidationOptions {
  enforceFreshness?: boolean;
  maxAgeMs?: number | null;
}

export class LicenseStore {
  static save(licenseResponse: LicenseResponse): void {
    const licenseFile = getLicenseFilePath();
    const dir = dirname(licenseFile);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const key = deriveKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);

    const jsonStr = JSON.stringify(licenseResponse);
    let encrypted = cipher.update(jsonStr, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    writeFileSync(licenseFile, `${iv.toString('base64')}:${encrypted}`, 'utf-8');
  }

  static load(): LicenseResponse | null {
    const licenseFile = getLicenseFilePath();

    if (!existsSync(licenseFile)) {
      return null;
    }

    try {
      const content = readFileSync(licenseFile, 'utf-8');
      if (!content || !content.includes(':')) {
        return null;
      }

      const [ivBase64, encrypted] = content.split(':');
      const key = deriveKey();
      const iv = Buffer.from(ivBase64, 'base64');
      const decipher = createDecipheriv('aes-256-cbc', key, iv);

      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted) as LicenseResponse;
    } catch {
      return null;
    }
  }

  static clear(): void {
    const licenseFile = getLicenseFilePath();
    if (existsSync(licenseFile)) {
      unlinkSync(licenseFile);
    }
  }

  static validateLicenseResponse(
    licenseResponse: LicenseResponse,
    options: LicenseValidationOptions = {}
  ): LicenseValidationResult {
    if (!licenseResponse?.data?.license || !licenseResponse?.data?.user) {
      return {
        valid: false,
        error: 'Invalid license payload structure',
      };
    }

    const { enforceFreshness = false, maxAgeMs } = options;

    return verifyLicenseResponse(licenseResponse, {
      expectedDeviceId: getDeviceId(),
      expectedClientType: CLIENT_TYPE,
      maxAgeMs: enforceFreshness ? maxAgeMs : null,
    }) as LicenseValidationResult;
  }

  static verifySignature(licenseResponse: LicenseResponse): boolean {
    return this.validateLicenseResponse(licenseResponse).valid;
  }

  static isExpired(licenseResponse: LicenseResponse): boolean {
    if (!licenseResponse?.data?.license?.expiresAt) {
      return true;
    }

    const expiresAt = new Date(licenseResponse.data.license.expiresAt).getTime();
    return !Number.isFinite(expiresAt) || Date.now() >= expiresAt;
  }

  static needsRefresh(): boolean {
    const licenseResponse = this.load();
    if (!licenseResponse) {
      return true;
    }

    if (!licenseResponse?.data?.license?.expiresAt) {
      return true;
    }

    const refreshThreshold = 5 * 60 * 1000;
    const expiresAt = new Date(licenseResponse.data.license.expiresAt).getTime();
    return !Number.isFinite(expiresAt) || Date.now() >= expiresAt - refreshThreshold;
  }

  static getValidLicenseData(): LicenseData | null {
    const licenseResponse = this.load();
    if (!licenseResponse) {
      return null;
    }

    if (this.isExpired(licenseResponse)) {
      return null;
    }

    const validation = this.validateLicenseResponse(licenseResponse);
    if (!validation.valid) {
      return null;
    }

    return licenseResponse.data;
  }

  static getSpaces(): SpaceInfo[] {
    const data = this.getValidLicenseData();
    return data?.spaces || [];
  }

  static hasProAccess(): boolean {
    const data = this.getValidLicenseData();
    return data?.user?.hasPro || false;
  }

  static getUserInfo(): LicenseData['user'] | null {
    const data = this.getValidLicenseData();
    return data?.user || null;
  }

  static getLicenseInfo(): LicenseData['license'] | null {
    const data = this.getValidLicenseData();
    return data?.license || null;
  }
}
