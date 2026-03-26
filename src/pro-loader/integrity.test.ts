import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getProModuleFilePath, getProModulesDir } from '../shared/paths.js';
import { ProIntegrity } from './integrity.js';
import type { ProModuleMeta, SignedProModuleMeta } from '../shared/types.js';
import { t } from '../i18n/index.js';

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalDateNow = Date.now;

function setTempHome(): string {
  const tempHome = mkdtempSync(join(tmpdir(), 'agilebuilder-pro-integrity-'));
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  return tempHome;
}

function restoreEnvironment(tempHome?: string): void {
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  Date.now = originalDateNow;
  if (tempHome) {
    rmSync(tempHome, { recursive: true, force: true });
  }
}

function freezeTime(timestamp: number): void {
  Date.now = () => timestamp;
}

const signedModuleContent = 'console.log("signed-module")';
const signedMetaFixture: ProModuleMeta = {
  version: '2.0.0',
  minCliVersion: '1.0.0',
  sha256: '3358fe7d073814d9c43cd4364866279838094332e8a836c6743b7e6ea4c5a874',
  size: 28,
  updatedAt: '2026-03-20T00:00:00.000Z',
  features: ['clone-with-variables', 'hooks'],
};
const signedEnvelopeFixture: SignedProModuleMeta = {
  data: signedMetaFixture,
  signature: {
    payload:
      'eyJkYXRhIjp7InZlcnNpb24iOiIyLjAuMCIsIm1pbkNsaVZlcnNpb24iOiIxLjAuMCIsInNoYTI1NiI6IjMzNThmZTdkMDczODE0ZDljNDNjZDQzNjQ4NjYyNzk4MzgwOTQzMzJlOGE4MzZjNjc0M2I3ZTZlYTRjNWE4NzQiLCJzaXplIjoyOCwidXBkYXRlZEF0IjoiMjAyNi0wMy0yMFQwMDowMDowMC4wMDBaIiwiZmVhdHVyZXMiOlsiY2xvbmUtd2l0aC12YXJpYWJsZXMiLCJob29rcyJdfSwidGltZXN0YW1wIjoxNzYwMDAwMDAwMDAwLCJqdGkiOiJmaXh0dXJlLXNpZ25lZC1tYW5pZmVzdCJ9',
    sign:
      'd4+wOwqeKyITAULabk8UA24jm43VsfqHHa+pAgWBKWciWJesUHDkccX13h8oF4UhylgWe7T4vvUwhJWNGc80j3eLrPghjVeEfTMBG2rnUPR8tpL6YlLGAJ2cCqp4wqMJfEun2pvbFoERlJq+t8Jfkh6v+9+wSEnw3aEUVMjv10ChZAEl8t0ZveyRLzax9+jnV2PQcw0fc5RH1t/PXpon3nEkvkeKjN4bs+hrEBAwt0HiCIssAq/ALs31hONaDxmOAHsIxGSE+w+yfbspXPkgtdw/H3oHZBz2qj5UQE6uY2xeWKYQHmq8dW0HMOT8NLnVoMhFInJ9XEUSYn/wHRH3tw==',
    algorithm: 'RS256',
    timestamp: 1760000000000,
  },
};

function writeModuleState(
  metaOrEnvelope: ProModuleMeta | SignedProModuleMeta,
  moduleContent: string
): void {
  mkdirSync(getProModulesDir(), { recursive: true });
  writeFileSync(getProModuleFilePath(), moduleContent, 'utf8');
  writeFileSync(
    join(getProModulesDir(), 'version.json'),
    JSON.stringify(metaOrEnvelope, null, 2),
    'utf8'
  );
}

test('legacy version metadata is detected and marked for migration', () => {
  const tempHome = setTempHome();

  try {
    const legacyMeta: ProModuleMeta = {
      version: '1.2.3',
      minCliVersion: '1.0.0',
      sha256: 'abc123',
      size: 12,
      updatedAt: '2026-03-20T00:00:00.000Z',
      features: ['hooks'],
    };

    writeModuleState(legacyMeta, 'console.log("legacy")');

    const result = ProIntegrity.quickCheck();
    assert.equal(result.valid, false);
    assert.equal(result.reason, t('pro.legacyVersionFileDetected'));
    assert.equal(result.recoveryHint, t('pro.legacyVersionFileHint'));
    assert.equal(ProIntegrity.getMeta(), null);
  } finally {
    restoreEnvironment(tempHome);
  }
});

test('signed manifest passes integrity verification and exposes metadata', () => {
  const tempHome = setTempHome();

  try {
    freezeTime(signedEnvelopeFixture.signature.timestamp);
    writeModuleState(signedEnvelopeFixture, signedModuleContent);

    const result = ProIntegrity.verify();
    assert.equal(result.valid, true);
    assert.equal(result.meta?.version, '2.0.0');
    assert.deepEqual(ProIntegrity.getMeta(), signedMetaFixture);
  } finally {
    restoreEnvironment(tempHome);
  }
});

test('tampered module content fails integrity verification', () => {
  const tempHome = setTempHome();

  try {
    freezeTime(signedEnvelopeFixture.signature.timestamp);
    writeModuleState(signedEnvelopeFixture, 'console.log("tampered-module")');

    const result = ProIntegrity.verify();
    assert.equal(result.valid, false);
    assert.equal(result.reason, t('pro.moduleCorrupted'));
    assert.equal(result.recoveryHint, t('pro.redownloadHint'));
  } finally {
    restoreEnvironment(tempHome);
  }
});
