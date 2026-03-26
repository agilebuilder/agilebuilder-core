/**
 * License 签名验证模块
 *
 * 使用 RSA-SHA256 验证后端签发的 License 数据。
 */

import { createVerify } from 'crypto';
import { isDeepStrictEqual } from 'util';
import type {
  LicenseClaims,
  LicenseResponse,
  LicenseSignature,
  SignedClaims,
  SignedDataResponse,
} from '../shared/types.js';
import { t } from '../i18n/index.js';

const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuszDhfiJzwrKtpFdQvzA
ZyVmEErmQW+asHHw+UU2844TfQRZ+GXsFkZl4x/Zk3M+uIvRRphoGktFvpSsp+sB
53zxxalivHOhgLX7mwuRosIppDTf6MwO2BiQ5/iMsDvufAyqnrXAGogI2ol4u2vX
CEGQQwyy22NFnOlDq4VbzHB3kycqIhCyn9X6pzpxaClwXyReZrYfzJc2r2VPTPpQ
6HXIX8JMT6DYCK9Ei74HJLuWrHPTaVXfS8vqCqggCfxaA5mQ20pSYD8Rs/3r4fEn
3qeIwzqssswqerluOArbM6NENY2H7tBuIs5RFYt3GffW0Z0FJWwCxFsdtbj9Epg+
nwIDAQAB
-----END PUBLIC KEY-----`;

const LICENSE_TIMESTAMP_MAX_AGE_MS = 10 * 60 * 1000;

export interface SignatureVerifyResult {
  valid: boolean;
  error?: string;
  claims?: SignedClaims;
}

export interface VerifySignedDataOptions<T = unknown> {
  expectedData?: T;
  expectedDeviceId?: string;
  expectedClientType?: string;
  maxAgeMs?: number | null;
}

function hasExpectedDataOption<T>(
  options: VerifySignedDataOptions<T>
): options is VerifySignedDataOptions<T> & { expectedData: T } {
  return Object.prototype.hasOwnProperty.call(options, 'expectedData');
}

function parseSignedClaims<T = unknown>(payload: string): SignedClaims<T> {
  const payloadJson = Buffer.from(payload, 'base64').toString('utf8');
  return JSON.parse(payloadJson) as SignedClaims<T>;
}

export function isTimestampValid(
  timestamp: number,
  maxAgeMs: number = LICENSE_TIMESTAMP_MAX_AGE_MS
): boolean {
  const now = Date.now();
  return Number.isFinite(timestamp) && Math.abs(now - timestamp) < maxAgeMs;
}

export function verifyLicenseSignature(
  payload: string,
  signature: string,
  algorithm: string = 'RS256'
): SignatureVerifyResult {
  if (algorithm !== 'RS256') {
    return {
      valid: false,
      error: t('license.signatureUnsupportedAlgorithm', { algorithm }),
    };
  }

  try {
    const verify = createVerify('RSA-SHA256');
    verify.update(payload);

    const isValid = verify.verify(LICENSE_PUBLIC_KEY, signature, 'base64');
    if (!isValid) {
      return {
        valid: false,
        error: t('license.signatureVerifyFailed'),
      };
    }

    return {
      valid: true,
      claims: parseSignedClaims(payload),
    };
  } catch (error) {
    return {
      valid: false,
      error: t('license.signatureVerifyException', {
        error:
          error instanceof Error ? error.message : t('common.unknownError'),
      }),
    };
  }
}

export function verifySignedData<T = unknown>(
  signature: LicenseSignature,
  options: VerifySignedDataOptions<T> = {}
): SignatureVerifyResult {
  const {
    expectedData,
    expectedDeviceId,
    expectedClientType,
    maxAgeMs = LICENSE_TIMESTAMP_MAX_AGE_MS,
  } = options as VerifySignedDataOptions;

  const signResult = verifyLicenseSignature(
    signature.payload,
    signature.sign,
    signature.algorithm
  );
  if (!signResult.valid || !signResult.claims) {
    return signResult;
  }

  const claims = signResult.claims as SignedClaims<T>;

  if (maxAgeMs !== null && !isTimestampValid(signature.timestamp, maxAgeMs)) {
    return {
      valid: false,
      error: t('license.signatureTimestampInvalid'),
    };
  }

  if (claims.timestamp !== signature.timestamp) {
    return {
      valid: false,
      error: t('license.signaturePayloadMismatch'),
    };
  }

  if (hasExpectedDataOption(options) && !isDeepStrictEqual(claims.data, expectedData)) {
    return {
      valid: false,
      error: t('license.signaturePayloadMismatch'),
    };
  }

  if (expectedDeviceId && claims.deviceId !== expectedDeviceId) {
    return {
      valid: false,
      error: t('license.signatureDeviceMismatch'),
    };
  }

  if (expectedClientType && claims.clientType !== expectedClientType) {
    return {
      valid: false,
      error: t('license.signatureClientTypeMismatch'),
    };
  }

  return {
    valid: true,
    claims,
  };
}

export function verifySignedDataResponse<T = unknown>(
  response: SignedDataResponse<T>,
  options: Omit<VerifySignedDataOptions<T>, 'expectedData'> = {}
): SignatureVerifyResult {
  return verifySignedData<T>(response.signature, {
    ...options,
    expectedData: response.data,
  });
}

export function verifyLicenseResponse(
  response: LicenseResponse,
  options: Omit<VerifySignedDataOptions<LicenseResponse['data']>, 'expectedData'> = {}
): SignatureVerifyResult {
  return verifySignedDataResponse<LicenseResponse['data']>(response, options);
}

export function isPublicKeyConfigured(): boolean {
  return LICENSE_PUBLIC_KEY.includes('BEGIN PUBLIC KEY');
}

export function getPublicKeyInfo(): { configured: boolean; preview: string } {
  const configured = isPublicKeyConfigured();
  const lines = LICENSE_PUBLIC_KEY
    .split('\n')
    .filter(line => !line.startsWith('-----'));
  const preview = lines.length > 0 ? `${lines[0].substring(0, 20)}...` : 'N/A';

  return { configured, preview };
}
