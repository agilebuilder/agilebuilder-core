import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { AppError } from '../errors/app-error.js';
import { BUILTIN_LICENSE_PUBLIC_KEY } from './public-key.js';
import { getLicensePublicKey, verifyLicenseSignature } from './signature.js';
import type { LicenseResponse } from '../client/client-api.js';

function createSignedLicense(payload: string, privateKey: string): LicenseResponse {
  const signer = createSign('RSA-SHA256');
  signer.update(payload);
  return {
    data: {
      license: {
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        serverTime: new Date().toISOString(),
      },
      user: {
        id: 'u1',
        username: 'user@example.com',
        displayName: 'User',
        hasPro: true,
      },
      spaces: [],
    },
    signature: {
      payload,
      sign: signer.sign(privateKey, 'base64'),
      algorithm: 'RS256',
      timestamp: Date.now(),
    },
  };
}

test('verifyLicenseSignature accepts valid RS256 signatures and rejects invalid ones', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const payload = Buffer.from(JSON.stringify({ data: { ok: true }, timestamp: Date.now() })).toString('base64');
  const license = createSignedLicense(payload, privateKey);

  assert.doesNotThrow(() => verifyLicenseSignature(license, publicKey));

  const invalid = {
    ...license,
    signature: {
      ...license.signature,
      payload: Buffer.from('tampered').toString('base64'),
    },
  };
  assert.throws(() => verifyLicenseSignature(invalid, publicKey), AppError);
});

test('license public key ignores environment overrides', () => {
  const oldPublicKey = process.env.AGILEBUILDER_LICENSE_PUBLIC_KEY;
  process.env.AGILEBUILDER_LICENSE_PUBLIC_KEY = 'malicious-public-key';

  try {
    assert.equal(getLicensePublicKey(), BUILTIN_LICENSE_PUBLIC_KEY);
  } finally {
    if (oldPublicKey === undefined) {
      delete process.env.AGILEBUILDER_LICENSE_PUBLIC_KEY;
    } else {
      process.env.AGILEBUILDER_LICENSE_PUBLIC_KEY = oldPublicKey;
    }
  }
});
