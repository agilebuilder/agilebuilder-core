import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

test('TokenStore saves and clears API key auth data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-auth-'));
  const oldDataDir = process.env.AGILEBUILDER_CORE1_DATA_DIR;
  process.env.AGILEBUILDER_CORE1_DATA_DIR = dir;
  try {
    const { TokenStore } = await import(`./token-store.js?case=${Date.now()}`);
    TokenStore.saveApiKey('test-key', { id: 'u1', name: 'Tester' });
    assert.equal(await TokenStore.getValidToken(), 'test-key');
    assert.equal(TokenStore.getUser()?.name, 'Tester');
    TokenStore.clear();
    assert.equal(TokenStore.load(), null);
  } finally {
    if (oldDataDir === undefined) {
      delete process.env.AGILEBUILDER_CORE1_DATA_DIR;
    } else {
      process.env.AGILEBUILDER_CORE1_DATA_DIR = oldDataDir;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
