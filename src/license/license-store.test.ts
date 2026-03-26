import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { LicenseStore } from './license-store.js';
import { getDeviceFilePath } from '../shared/paths.js';
import {
  SIGNED_LICENSE_FIXTURE,
  STALE_LICENSE_TIMESTAMP,
} from '../test/signed-fixtures.js';

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

function setTempHome(): string {
  const tempHome = mkdtempSync(join(tmpdir(), 'agilebuilder-license-test-'));
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  return tempHome;
}

function restoreEnvironment(tempHome?: string): void {
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  if (tempHome) {
    rmSync(tempHome, { recursive: true, force: true });
  }
}

test('local cached license remains valid after signature freshness window expires', () => {
  const tempHome = setTempHome();

  try {
    mkdirSync(dirname(getDeviceFilePath()), { recursive: true });
    writeFileSync(
      getDeviceFilePath(),
      '1234567890abcdef1234567890abcdef',
      'utf8'
    );

    const localValidation = LicenseStore.validateLicenseResponse(
      SIGNED_LICENSE_FIXTURE
    );
    assert.equal(localValidation.valid, true);

    const freshValidation = LicenseStore.validateLicenseResponse(
      SIGNED_LICENSE_FIXTURE,
      {
      enforceFreshness: true,
      }
    );
    assert.equal(freshValidation.valid, false);

    assert.equal(
      SIGNED_LICENSE_FIXTURE.signature.timestamp,
      STALE_LICENSE_TIMESTAMP
    );

    LicenseStore.save(SIGNED_LICENSE_FIXTURE);
    assert.deepEqual(LicenseStore.getValidLicenseData(), SIGNED_LICENSE_FIXTURE.data);
  } finally {
    restoreEnvironment(tempHome);
  }
});
