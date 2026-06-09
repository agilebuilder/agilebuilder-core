import { createVerify } from 'node:crypto';
import { AppError } from '../errors/app-error.js';
import { BUILTIN_LICENSE_PUBLIC_KEY } from './public-key.js';
import type { LicenseResponse } from '../client/client-api.js';

export function getLicensePublicKey(): string {
  return BUILTIN_LICENSE_PUBLIC_KEY;
}

export function verifyLicenseSignature(response: LicenseResponse, publicKey = getLicensePublicKey()): void {
  if (response.signature.algorithm !== 'RS256') {
    throw new AppError({
      code: 'LICENSE_ALGORITHM_UNSUPPORTED',
      message: 'Unsupported license signature algorithm.',
      category: 'permission',
    });
  }

  const verifier = createVerify('RSA-SHA256');
  verifier.update(response.signature.payload);
  const valid = verifier.verify(publicKey, response.signature.sign, 'base64');
  if (!valid) {
    throw new AppError({
      code: 'LICENSE_SIGNATURE_INVALID',
      message: 'License signature is invalid.',
      category: 'permission',
    });
  }
}
