import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { register } from 'node:module';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AppError } from '../errors/app-error.js';
import { ClientApi } from '../client/client-api.js';
import { TokenStore } from '../auth/token-store.js';
import { withIsolatedDataDir } from '../test-helpers/data-dir.js';
import { licenseWithPlan } from '../test-helpers/api-mocks.js';
import { setLicensePublicKey } from '../test-helpers/mock-license-signature.js';
import type { LicenseResponse } from '../client/client-api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const loaderExt = __filename.endsWith('.ts') ? '.ts' : '.js';
const loaderFile = join(__dirname, `../test-helpers/mock-license-signature-loader${loaderExt}`);
register(pathToFileURL(loaderFile));

const { LicenseStore } = await import('../license/license-store.js');

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
setLicensePublicKey(publicKey);

const originalGetLicense = ClientApi.getLicense;
const originalGetValidToken = TokenStore.getValidToken;

function restore(): void {
  ClientApi.getLicense = originalGetLicense;
  TokenStore.getValidToken = originalGetValidToken;
}

test.afterEach(restore);

function createSignedLicense(
  planType: 'free' | 'trial' | 'pro',
  spaceIds: string[] = ['space-1'],
): LicenseResponse {
  const response = licenseWithPlan(planType, spaceIds);
  const payload = Buffer.from(JSON.stringify({ planType, spaceIds, timestamp: Date.now() })).toString('base64');
  const signer = createSign('RSA-SHA256');
  signer.update(payload);
  const sign = signer.sign(privateKey, 'base64');
  response.signature = {
    payload,
    sign,
    algorithm: 'RS256',
    timestamp: Date.now(),
  };
  return response;
}

test('LicenseStore.save accepts valid RS256 signatures and writes cache file', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const response = createSignedLicense('pro');
    LicenseStore.save(response);

    const content = await readFile(join(dataDir, 'license-cache.json'), 'utf8');
    const parsed = JSON.parse(content);
    assert.equal(parsed.fetchedAt > 0, true);
    assert.deepEqual(parsed.response, JSON.parse(JSON.stringify(response)));
  });
});

test('LicenseStore.save rejects unsupported signature algorithms', async () => {
  await withIsolatedDataDir(async () => {
    const response = createSignedLicense('pro');
    response.signature.algorithm = 'HS256' as 'RS256';

    assert.throws(
      () => LicenseStore.save(response),
      (error) => error instanceof AppError && error.code === 'LICENSE_ALGORITHM_UNSUPPORTED',
    );
  });
});

test('LicenseStore.save rejects tampered signatures', async () => {
  await withIsolatedDataDir(async () => {
    const response = createSignedLicense('pro');
    response.signature.payload = Buffer.from('tampered').toString('base64');

    assert.throws(
      () => LicenseStore.save(response),
      (error) => error instanceof AppError && error.code === 'LICENSE_SIGNATURE_INVALID',
    );
  });
});

test('LicenseStore.load ignores corrupt cache files', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    await writeFile(join(dataDir, 'license-cache.json'), 'not-json', 'utf8');

    assert.equal(LicenseStore.load(), null);
    assert.equal(LicenseStore.getValidCached(), null);
  });
});

test('LicenseStore.getValidCached returns cached license within TTL', async () => {
  await withIsolatedDataDir(async () => {
    const response = createSignedLicense('pro');
    LicenseStore.save(response);

    const cached = LicenseStore.getValidCached();
    assert.notEqual(cached, null);
    assert.equal(cached?.data.spaces[0]?.plan.type, 'pro');
  });
});

test('LicenseStore.getValidCached returns null for expired TTL', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const response = createSignedLicense('pro');
    LicenseStore.save(response);

    const filePath = join(dataDir, 'license-cache.json');
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    parsed.fetchedAt = Date.now() - 2 * 60 * 60 * 1000;
    await writeFile(filePath, JSON.stringify(parsed), 'utf8');

    assert.equal(LicenseStore.getValidCached(), null);
  });
});

test('LicenseStore.getOrRefresh returns cached license without calling API', async () => {
  await withIsolatedDataDir(async () => {
    const response = createSignedLicense('pro');
    LicenseStore.save(response);

    let called = false;
    ClientApi.getLicense = async () => {
      called = true;
      return Promise.reject(new Error('should not be called'));
    };

    const result = await LicenseStore.getOrRefresh();
    assert.equal(result?.data.spaces[0]?.plan.type, 'pro');
    assert.equal(called, false);
  });
});

test('LicenseStore.getOrRefresh force refresh fetches new license', async () => {
  await withIsolatedDataDir(async () => {
    const cached = createSignedLicense('pro');
    LicenseStore.save(cached);

    const refreshed = createSignedLicense('trial');
    let tokenUsed: string | undefined;
    TokenStore.getValidToken = async () => 'token-123';
    ClientApi.getLicense = async (token) => {
      tokenUsed = token;
      return refreshed;
    };

    const result = await LicenseStore.getOrRefresh(true);
    assert.equal(result?.data.spaces[0]?.plan.type, 'trial');
    assert.equal(tokenUsed, 'token-123');
  });
});

test('LicenseStore.getOrRefresh returns null when no token and no cache', async () => {
  await withIsolatedDataDir(async () => {
    TokenStore.getValidToken = async () => null;

    const result = await LicenseStore.getOrRefresh();
    assert.equal(result, null);
  });
});

test('LicenseStore.getOrRefresh force refresh throws AUTH_TOKEN_UNAVAILABLE when no token', async () => {
  await withIsolatedDataDir(async () => {
    TokenStore.getValidToken = async () => null;

    await assert.rejects(
      () => LicenseStore.getOrRefresh(true),
      (error) => error instanceof AppError && error.code === 'AUTH_TOKEN_UNAVAILABLE',
    );
  });
});

test('LicenseStore.refresh throws AUTH_TOKEN_UNAVAILABLE when no token', async () => {
  await withIsolatedDataDir(async () => {
    TokenStore.getValidToken = async () => null;

    await assert.rejects(
      () => LicenseStore.refresh(),
      (error) => error instanceof AppError && error.code === 'AUTH_TOKEN_UNAVAILABLE',
    );
  });
});

test('LicenseStore.refresh fetches and saves license', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const response = createSignedLicense('pro');
    TokenStore.getValidToken = async () => 'token-456';
    ClientApi.getLicense = async () => response;

    const result = await LicenseStore.refresh();
    assert.equal(result.data.spaces[0].plan.type, 'pro');

    const content = await readFile(join(dataDir, 'license-cache.json'), 'utf8');
    const parsed = JSON.parse(content);
    assert.equal(parsed.response.data.spaces[0].plan.type, 'pro');
  });
});
