import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ProLoader } from './loader.js';
import { getProModuleFilePath, getProModulesDir } from '../shared/paths.js';
import { t } from '../i18n/index.js';
import type { SignedProModuleMeta } from '../shared/types.js';
import {
  SIGNED_MANIFEST_FIXTURE,
  SIGNED_MODULE_CONTENT,
} from '../test/signed-fixtures.js';

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalConsoleLog = console.log;

function setTempHome(): string {
  const tempHome = mkdtempSync(join(tmpdir(), 'agilebuilder-pro-loader-'));
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  return tempHome;
}

function restoreEnvironment(tempHome?: string): void {
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  console.log = originalConsoleLog;
  ProLoader.unload();
  if (tempHome) {
    rmSync(tempHome, { recursive: true, force: true });
  }
}

function writeModuleState(
  manifest: SignedProModuleMeta,
  moduleContent: string
): void {
  mkdirSync(getProModulesDir(), { recursive: true });
  writeFileSync(getProModuleFilePath(), moduleContent, 'utf8');
  writeFileSync(
    join(getProModulesDir(), 'version.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );
}

test('loader accepts signed local module after signature freshness window expires', async () => {
  const tempHome = setTempHome();

  try {
    console.log = () => {};

    writeModuleState(SIGNED_MANIFEST_FIXTURE, SIGNED_MODULE_CONTENT);

    const result = await ProLoader.load();
    assert.equal(result.success, true);
    assert.equal(result.module?.version, '2.0.0');
  } finally {
    restoreEnvironment(tempHome);
  }
});

test('loader rejects tampered module before executing local code', async () => {
  const tempHome = setTempHome();

  try {
    console.log = () => {};

    const markerPath = join(tempHome, 'tampered-executed.txt');
    writeModuleState(
      SIGNED_MANIFEST_FIXTURE,
      `require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'executed', 'utf8'); module.exports = { version: "tampered" };`
    );

    const result = await ProLoader.load();
    assert.equal(result.success, false);
    assert.match(result.error || '', new RegExp(t('pro.moduleCorrupted')));
    assert.equal(ProLoader.getModule(), null);
    assert.equal(ProLoader.getState().loaded, false);
    assert.equal(existsSync(markerPath), false);
  } finally {
    restoreEnvironment(tempHome);
  }
});
