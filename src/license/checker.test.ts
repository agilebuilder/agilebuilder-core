import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { AccessChecker } from './checker.js';
import { LicenseApi } from './api.js';
import { LicenseStore } from './license-store.js';
import { DeviceApi } from '../device/device-api.js';
import { TokenStore } from '../auth/token-store.js';
import { getDeviceFilePath } from '../shared/paths.js';
import { t } from '../i18n/index.js';
import {
  CHECKER_TEST_DEVICE_ID,
  SIGNED_CHECKER_LICENSE_FIXTURE,
} from '../test/signed-fixtures.js';

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalGetValidToken = TokenStore.getValidToken;
const originalRegister = DeviceApi.register;
const originalGetLicense = LicenseApi.getLicense;

function setTempHome(): string {
  const tempHome = mkdtempSync(join(tmpdir(), 'agilebuilder-checker-test-'));
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  return tempHome;
}

function restoreEnvironment(tempHome?: string): void {
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  TokenStore.getValidToken = originalGetValidToken;
  DeviceApi.register = originalRegister;
  LicenseApi.getLicense = originalGetLicense;
  if (tempHome) {
    rmSync(tempHome, { recursive: true, force: true });
  }
}

test('fetchAndCacheLicense rejects stale signed responses and does not cache them', async () => {
  const tempHome = setTempHome();

  try {
    mkdirSync(dirname(getDeviceFilePath()), { recursive: true });
    writeFileSync(getDeviceFilePath(), CHECKER_TEST_DEVICE_ID, 'utf8');

    TokenStore.getValidToken = async () => 'token';
    DeviceApi.register = async () => ({ success: true });
    LicenseApi.getLicense = async () => ({
      success: true,
      data: SIGNED_CHECKER_LICENSE_FIXTURE,
    });

    const result = await AccessChecker.fetchAndCacheLicense();

    assert.equal(result.success, false);
    assert.equal(result.error, t('license.signatureTimestampInvalid'));
    assert.equal(LicenseStore.load(), null);
  } finally {
    restoreEnvironment(tempHome);
  }
});
