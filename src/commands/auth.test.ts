import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { AppError } from '../errors/app-error.js';
import { TokenStore } from '../auth/token-store.js';
import { ClientApi } from '../client/client-api.js';
import { withIsolatedDataDir } from '../test-helpers/data-dir.js';
import { getDataDir } from '../shared/paths.js';

function captureLogs() {
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  return {
    logs,
    restore: () => {
      console.log = original;
    },
  };
}

function restoreClientApi() {
  // ClientApi static methods are replaced per-test in try/finally blocks.
}

test('login --api-key succeeds and persists the token', async () => {
  await withIsolatedDataDir(async () => {
    const originalGetUserProfile = ClientApi.getUserProfile;
    const originalRegisterDevice = ClientApi.registerDevice;
    ClientApi.getUserProfile = async () => ({ id: 'u1', name: 'Tester', email: 'tester@example.com' });
    ClientApi.registerDevice = async () => ({ isNew: true });
    const { logs, restore } = captureLogs();
    try {
      const { createLoginCommand } = await import('./auth.js');
      const cmd = createLoginCommand();
      await cmd.parseAsync(['node', 'ag', '--api-key', 'ak-test']);

      assert.match(logs[0] ?? '', /Logged in successfully/);
      assert.match(logs[0] ?? '', /Tester/);
      assert.equal(await TokenStore.getValidToken(), 'ak-test');
      assert.equal(TokenStore.getUser()?.email, 'tester@example.com');
    } finally {
      restore();
      ClientApi.getUserProfile = originalGetUserProfile;
      ClientApi.registerDevice = originalRegisterDevice;
      TokenStore.clear();
    }
  });
});

test('login --api-key --json returns structured user data', async () => {
  await withIsolatedDataDir(async () => {
    const originalGetUserProfile = ClientApi.getUserProfile;
    const originalRegisterDevice = ClientApi.registerDevice;
    ClientApi.getUserProfile = async () => ({ id: 'u2', name: 'JSON Tester' });
    ClientApi.registerDevice = async () => ({ isNew: true });
    const { logs, restore } = captureLogs();
    try {
      const { createLoginCommand } = await import('./auth.js');
      const cmd = createLoginCommand();
      await cmd.parseAsync(['node', 'ag', '--api-key', 'ak-json', '--json']);

      const parsed = JSON.parse(logs[0] ?? '{}');
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.user?.id, 'u2');
      assert.equal(parsed.data.user?.name, 'JSON Tester');
      assert.equal(await TokenStore.getValidToken(), 'ak-json');
    } finally {
      restore();
      ClientApi.getUserProfile = originalGetUserProfile;
      ClientApi.registerDevice = originalRegisterDevice;
      TokenStore.clear();
    }
  });
});

test('login --api-key "" rejects empty key', async () => {
  await withIsolatedDataDir(async () => {
    const { createLoginCommand } = await import('./auth.js');
    const cmd = createLoginCommand();
    await assert.rejects(
      cmd.parseAsync(['node', 'ag', '--api-key', '']),
      (err: unknown) => err instanceof AppError && (err as AppError).code === 'API_KEY_REQUIRED',
    );
  });
});

test('login --api-key does not persist token when the backend rejects the key', async () => {
  await withIsolatedDataDir(async () => {
    const original = ClientApi.getUserProfile;
    ClientApi.getUserProfile = async () => {
      throw new AppError({ code: 'HTTP_401', message: 'Unauthorized', category: 'auth' });
    };
    try {
      const { createLoginCommand } = await import('./auth.js');
      const cmd = createLoginCommand();
      await assert.rejects(
        cmd.parseAsync(['node', 'ag', '--api-key', 'ak-invalid']),
        (err: unknown) => err instanceof AppError && (err as AppError).code === 'HTTP_401',
      );
      assert.equal(await TokenStore.getValidToken(), null);
      assert.equal(TokenStore.load(), null);
    } finally {
      ClientApi.getUserProfile = original;
      TokenStore.clear();
    }
  });
});

test('logout removes the stored token and prints a success message', async () => {
  await withIsolatedDataDir(async () => {
    TokenStore.saveApiKey('ak-logout', { id: 'u1', name: 'Logout Tester' });
    const { logs, restore } = captureLogs();
    try {
      const { createLogoutCommand } = await import('./auth.js');
      const cmd = createLogoutCommand();
      await cmd.parseAsync(['node', 'ag']);

      assert.match(logs[0] ?? '', /Logged out/);
      assert.equal(TokenStore.load(), null);
    } finally {
      restore();
      TokenStore.clear();
    }
  });
});

test('logout --json returns structured confirmation', async () => {
  await withIsolatedDataDir(async () => {
    TokenStore.saveApiKey('ak-logout-json', { id: 'u1', name: 'Logout JSON' });
    const { logs, restore } = captureLogs();
    try {
      const { createLogoutCommand } = await import('./auth.js');
      const cmd = createLogoutCommand();
      await cmd.parseAsync(['node', 'ag', '--json']);

      const parsed = JSON.parse(logs[0] ?? '{}');
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.loggedOut, true);
      assert.equal(TokenStore.load(), null);
    } finally {
      restore();
      TokenStore.clear();
    }
  });
});

test('logout is idempotent when no token exists', async () => {
  await withIsolatedDataDir(async () => {
    const { createLogoutCommand } = await import('./auth.js');
    const cmd = createLogoutCommand();
    await cmd.parseAsync(['node', 'ag']);
    await cmd.parseAsync(['node', 'ag', '--json']);
    assert.equal(TokenStore.load(), null);
  });
});

test('auth status reports not logged in', async () => {
  await withIsolatedDataDir(async () => {
    const { logs, restore } = captureLogs();
    try {
      const { createAuthCommand } = await import('./auth.js');
      const cmd = createAuthCommand();
      await cmd.parseAsync(['node', 'ag', 'status']);

      assert.match(logs[0] ?? '', /Not logged in/);
      assert.match(logs[0] ?? '', /Auth Type/);
    } finally {
      restore();
    }
  });
});

test('auth status --json reports not logged in', async () => {
  await withIsolatedDataDir(async () => {
    const { logs, restore } = captureLogs();
    try {
      const { createAuthCommand } = await import('./auth.js');
      const cmd = createAuthCommand();
      await cmd.parseAsync(['node', 'ag', 'status', '--json']);

      const parsed = JSON.parse(logs[0] ?? '{}');
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.loggedIn, false);
      assert.equal(parsed.data.authType, null);
      assert.equal(parsed.data.user, null);
    } finally {
      restore();
    }
  });
});

test('auth status reports API key login', async () => {
  await withIsolatedDataDir(async () => {
    TokenStore.saveApiKey('ak-status', { id: 'u3', name: 'Status User' });
    const { logs, restore } = captureLogs();
    try {
      const { createAuthCommand } = await import('./auth.js');
      const cmd = createAuthCommand();
      await cmd.parseAsync(['node', 'ag', 'status']);

      assert.match(logs[0] ?? '', /Logged in/);
      assert.match(logs[0] ?? '', /apiKey/);
      assert.match(logs[0] ?? '', /Status User/);
    } finally {
      restore();
      TokenStore.clear();
    }
  });
});

test('auth status tolerates a corrupted auth file', async () => {
  await withIsolatedDataDir(async () => {
    writeFileSync(join(getDataDir(), 'auth.enc'), 'not-valid-encrypted-data', 'utf8');
    const { logs, restore } = captureLogs();
    try {
      const { createAuthCommand } = await import('./auth.js');
      const cmd = createAuthCommand();
      await cmd.parseAsync(['node', 'ag', 'status', '--json']);

      const parsed = JSON.parse(logs[0] ?? '{}');
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.loggedIn, false);
      assert.equal(parsed.data.authType, null);
    } finally {
      restore();
      TokenStore.clear();
    }
  });
});

test('auth require-token succeeds when a token exists', async () => {
  await withIsolatedDataDir(async () => {
    TokenStore.saveApiKey('ak-require', { id: 'u1', name: 'Require User' });
    const { logs, restore } = captureLogs();
    try {
      const { createAuthCommand } = await import('./auth.js');
      const cmd = createAuthCommand();
      await cmd.parseAsync(['node', 'ag', 'require-token', '--json']);

      const parsed = JSON.parse(logs[0] ?? '{}');
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.available, true);
    } finally {
      restore();
      TokenStore.clear();
    }
  });
});

test('auth require-token throws when no token exists', async () => {
  await withIsolatedDataDir(async () => {
    const { createAuthCommand } = await import('./auth.js');
    const cmd = createAuthCommand();
    await assert.rejects(
      cmd.parseAsync(['node', 'ag', 'require-token']),
      (err: unknown) => err instanceof AppError && (err as AppError).code === 'AUTH_TOKEN_UNAVAILABLE',
    );
  });
});

test('auth token returns the raw token when logged in', async () => {
  await withIsolatedDataDir(async () => {
    TokenStore.saveApiKey('ak-raw', { id: 'u1', name: 'Raw User' });
    const { logs, restore } = captureLogs();
    try {
      const { createAuthCommand } = await import('./auth.js');
      const cmd = createAuthCommand();
      await cmd.parseAsync(['node', 'ag', 'token', '--json']);

      const parsed = JSON.parse(logs[0] ?? '{}');
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.token, 'ak-raw');
    } finally {
      restore();
      TokenStore.clear();
    }
  });
});

test('auth token throws when no token exists', async () => {
  await withIsolatedDataDir(async () => {
    const { createAuthCommand } = await import('./auth.js');
    const cmd = createAuthCommand();
    await assert.rejects(
      cmd.parseAsync(['node', 'ag', 'token']),
      (err: unknown) => err instanceof AppError && (err as AppError).code === 'AUTH_TOKEN_UNAVAILABLE',
    );
  });
});
