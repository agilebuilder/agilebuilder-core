import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { TokenStore } from './token-store.js';
import { getAuthRefreshLogFilePath } from '../shared/paths.js';

type FetchType = typeof globalThis.fetch;

const originalFetch = globalThis.fetch;
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalFetchUserInfo = TokenStore.fetchUserInfo;

function setTempHome(): string {
  const tempHome = mkdtempSync(join(tmpdir(), 'agilebuilder-auth-test-'));
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  return tempHome;
}

function restoreEnvironment(): void {
  globalThis.fetch = originalFetch;
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  TokenStore.fetchUserInfo = originalFetchUserInfo;
}

test.afterEach(() => {
  restoreEnvironment();
});

test('refreshToken accepts wrapped oauth responses', async () => {
  setTempHome();

  globalThis.fetch = (async () => new Response(JSON.stringify({
    success: true,
    data: {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 7200,
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as FetchType;

  TokenStore.fetchUserInfo = async () => ({
    id: 'user-1',
    name: 'Demo User',
    email: 'demo@example.com',
  });

  const refreshed = await (TokenStore as any).refreshToken({
    accessToken: 'old-access-token',
    refreshToken: 'old-refresh-token',
    expiresAt: Date.now() - 1000,
    user: {
      id: 'user-1',
      name: 'Old User',
    },
  });

  assert.equal(refreshed.accessToken, 'new-access-token');
  assert.equal(refreshed.refreshToken, 'new-refresh-token');
  assert.equal(refreshed.user.name, 'Demo User');
  assert.ok(refreshed.expiresAt > Date.now());
});

test('refreshToken logging tolerates invalid expiresAt values', async () => {
  setTempHome();

  globalThis.fetch = (async () => new Response(JSON.stringify({
    success: true,
    data: {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as FetchType;

  TokenStore.fetchUserInfo = async () => ({
    id: 'user-2',
    name: 'Recovered User',
  });

  const refreshed = await (TokenStore as any).refreshToken({
    accessToken: 'expired-access-token',
    refreshToken: 'refresh-token',
    expiresAt: Number.NaN,
    user: {
      id: 'user-2',
      name: 'Recovered User',
    },
  });

  assert.equal(refreshed.accessToken, 'new-access-token');

  const logContent = readFileSync(getAuthRefreshLogFilePath(), 'utf-8');
  assert.match(logContent, /"message":"started"/);
  assert.match(logContent, /"expiresAt":null/);
});

test('refreshToken preserves current user name when refreshed token only yields placeholder user info', async () => {
  setTempHome();

  globalThis.fetch = (async (input) => {
    const url = String(input);

    if (url.includes('/oauth/token')) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        id: 'user-3',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as FetchType;

  const refreshed = await (TokenStore as any).refreshToken({
    accessToken: 'old-access-token',
    refreshToken: 'old-refresh-token',
    expiresAt: Date.now() - 1000,
    user: {
      id: 'user-3',
      name: '真实用户名',
      email: 'demo@example.com',
    },
  });

  assert.equal(refreshed.user.name, '真实用户名');
  assert.equal(refreshed.user.email, 'demo@example.com');
});

test('refreshToken prefers showName style fields returned by refreshed user info', async () => {
  setTempHome();

  globalThis.fetch = (async (input) => {
    const url = String(input);

    if (url.includes('/oauth/token')) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        id: 'user-4',
        showName: '张三',
        userName: 'zhangsan',
        email: 'zhangsan@example.com',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as FetchType;

  const refreshed = await (TokenStore as any).refreshToken({
    accessToken: 'old-access-token',
    refreshToken: 'old-refresh-token',
    expiresAt: Date.now() - 1000,
    user: {
      id: 'user-4',
      name: '旧名字',
      email: 'old@example.com',
    },
  });

  assert.equal(refreshed.user.name, '张三');
  assert.equal(refreshed.user.email, 'zhangsan@example.com');
});

test('getValidToken clears auth when refresh endpoint returns unauthorized business failure', async () => {
  setTempHome();

  TokenStore.save({
    accessToken: 'expired-token',
    refreshToken: 'expired-refresh-token',
    expiresAt: Date.now() - 60_000,
    user: {
      id: 'u5',
      name: 'Demo User',
    },
  });

  globalThis.fetch = (async () => new Response(JSON.stringify({
    success: false,
    code: 1001,
    message: 'refreshTokenExpired',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as FetchType;

  const token = await TokenStore.getValidToken();

  assert.equal(token, null);
  assert.equal(TokenStore.load(), null);
});

test('getValidToken does not clear newer auth written by another process', async () => {
  setTempHome();

  TokenStore.save({
    accessToken: 'expired-token',
    refreshToken: 'stale-refresh-token',
    expiresAt: Date.now() - 60_000,
    user: {
      id: 'u6',
      name: '旧用户',
    },
  });

  globalThis.fetch = (async () => {
    TokenStore.save({
      accessToken: 'fresh-token',
      refreshToken: 'fresh-refresh-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: {
        id: 'u6',
        name: '新用户',
      },
    });

    return new Response(JSON.stringify({
      success: false,
      code: 1001,
      message: 'refreshTokenExpired',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as FetchType;

  const token = await TokenStore.getValidToken();
  const auth = TokenStore.load();

  assert.equal(token, null);
  assert.ok(auth);
  assert.equal(auth?.refreshToken, 'fresh-refresh-token');
  assert.equal(auth?.user.name, '新用户');
});
