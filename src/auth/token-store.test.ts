import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { withIsolatedDataDir } from '../test-helpers/data-dir.js';
import { getDataDir } from '../shared/paths.js';

test('TokenStore saves and clears API key auth data', async () => {
  await withIsolatedDataDir(async () => {
    const { TokenStore } = await import(`./token-store.js?case=${Date.now()}`);
    TokenStore.saveApiKey('test-key', { id: 'u1', name: 'Tester' });
    assert.equal(await TokenStore.getValidToken(), 'test-key');
    assert.equal(TokenStore.getUser()?.name, 'Tester');
    TokenStore.clear();
    assert.equal(TokenStore.load(), null);
  });
});

test('TokenStore returns an API key unchanged', async () => {
  await withIsolatedDataDir(async () => {
    const { TokenStore } = await import(`./token-store.js?case=${Date.now()}`);
    TokenStore.saveApiKey('api-key-unchanged', { id: 'u1', name: 'Tester' });
    assert.equal(await TokenStore.getValidToken(), 'api-key-unchanged');
  });
});

test('TokenStore returns a valid OAuth access token without refreshing', async () => {
  await withIsolatedDataDir(async () => {
    const { TokenStore } = await import(`./token-store.js?case=${Date.now()}`);
    TokenStore.saveOAuth({
      access_token: 'access-fresh',
      refresh_token: 'refresh-1',
      expires_in: 3600,
      user: { id: 'u1', name: 'Fresh' },
    });
    assert.equal(await TokenStore.getValidToken(), 'access-fresh');
  });
});

test('TokenStore refreshes an OAuth token that is near expiration', async () => {
  await withIsolatedDataDir(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: true,
        json: async () => ({
          data: {
            access_token: 'access-refreshed',
            refresh_token: 'refresh-refreshed',
            expires_in: 3600,
            user: { id: 'u2', name: 'Refreshed' },
          },
        }),
      }) as unknown as Response;

    try {
      const { TokenStore } = await import(`./token-store.js?case=${Date.now()}`);
      TokenStore.saveOAuth({
        access_token: 'access-stale',
        refresh_token: 'refresh-1',
        expires_in: 30,
        user: { id: 'u1', name: 'Stale' },
      });
      const token = await TokenStore.getValidToken();
      assert.equal(token, 'access-refreshed');

      const loaded = TokenStore.load();
      assert.equal(loaded?.accessToken, 'access-refreshed');
      assert.equal(loaded?.refreshToken, 'refresh-refreshed');
      assert.equal(loaded?.user?.name, 'Refreshed');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('TokenStore falls back to the original token when refresh fails but token is still valid', async () => {
  await withIsolatedDataDir(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('network unreachable');
    };

    try {
      const { TokenStore } = await import(`./token-store.js?case=${Date.now()}`);
      TokenStore.saveOAuth({
        access_token: 'access-fallback',
        refresh_token: 'refresh-1',
        expires_in: 90,
        user: { id: 'u1', name: 'Fallback' },
      });
      assert.equal(await TokenStore.getValidToken(), 'access-fallback');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('TokenStore returns null when refresh fails and the token has expired', async () => {
  await withIsolatedDataDir(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 400,
        text: async () => 'invalid_grant',
      }) as unknown as Response;

    try {
      const { TokenStore } = await import(`./token-store.js?case=${Date.now()}`);
      TokenStore.saveOAuth({
        access_token: 'access-expired',
        refresh_token: 'refresh-1',
        expires_in: -3600,
        user: { id: 'u1', name: 'Expired' },
      });
      assert.equal(await TokenStore.getValidToken(), null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('TokenStore returns null when the OAuth token has no refresh token and is expired', async () => {
  await withIsolatedDataDir(async () => {
    const { TokenStore } = await import(`./token-store.js?case=${Date.now()}`);
    TokenStore.saveOAuth({
      access_token: 'access-no-refresh',
      expires_in: -1,
      user: { id: 'u1', name: 'No Refresh' },
    });
    assert.equal(await TokenStore.getValidToken(), null);
  });
});

test('TokenStore stores auth.enc with restricted permissions', async () => {
  await withIsolatedDataDir(async () => {
    const { TokenStore } = await import(`./token-store.js?case=${Date.now()}`);
    TokenStore.saveApiKey('permission-key', { id: 'u1', name: 'Permission' });

    const authFile = join(getDataDir(), 'auth.enc');
    assert.ok(existsSync(authFile));

    if (process.platform !== 'win32') {
      const mode = statSync(authFile).mode & 0o777;
      assert.equal(mode, 0o600);
    }
  });
});

test('TokenStore treats a corrupted auth file as absent', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const { TokenStore } = await import(`./token-store.js?case=${Date.now()}`);
    writeFileSync(join(dataDir, 'auth.enc'), 'this-is-not-encrypted', 'utf8');

    assert.equal(TokenStore.load(), null);
    assert.equal(await TokenStore.getValidToken(), null);
    assert.equal(TokenStore.getUser(), null);
  });
});
