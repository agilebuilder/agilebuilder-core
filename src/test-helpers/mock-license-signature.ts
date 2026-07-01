import { createVerify } from 'node:crypto';
import { AppError } from '../errors/app-error.js';
import type { LicenseResponse } from '../client/client-api.js';

let publicKey = '';

export function setLicensePublicKey(key: string): void {
  publicKey = key;
}

export function getLicensePublicKey(): string {
  return publicKey;
}

export function verifyLicenseSignature(response: LicenseResponse): void {
  if (response.signature.algorithm !== 'RS256') {
    throw new AppError({
      code: 'LICENSE_ALGORITHM_UNSUPPORTED',
      message: 'Unsupported license signature algorithm.',
      category: 'permission',
    });
  }

  if (!publicKey) {
    throw new AppError({
      code: 'LICENSE_SIGNATURE_INVALID',
      message: 'No test public key configured.',
      category: 'permission',
    });
  }

  const verifier = createVerify('RSA-SHA256');
  verifier.update(response.signature.payload);
  if (!verifier.verify(publicKey, response.signature.sign, 'base64')) {
    throw new AppError({
      code: 'LICENSE_SIGNATURE_INVALID',
      message: 'License signature is invalid.',
      category: 'permission',
    });
  }
}
