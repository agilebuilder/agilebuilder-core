import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { statusCommand } from './status.js';
import { TokenStore } from '../../../auth/index.js';
import { t } from '../../../i18n/index.js';

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalGetValidToken = TokenStore.getValidToken;
const originalConsoleLog = console.log;

function setTempHome(): void {
  const tempHome = mkdtempSync(join(tmpdir(), 'agilebuilder-status-test-'));
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
}

function restoreEnvironment(): void {
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  TokenStore.getValidToken = originalGetValidToken;
  console.log = originalConsoleLog;
}

test.afterEach(() => {
  restoreEnvironment();
});

test('status refreshes expired auth before rendering token state', async () => {
  setTempHome();

  TokenStore.save({
    accessToken: 'expired-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() - 60_000,
    user: {
      id: 'u1',
      name: 'Demo User',
      email: 'demo@example.com',
    },
  });

  TokenStore.getValidToken = async () => {
    TokenStore.save({
      accessToken: 'fresh-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: {
        id: 'u1',
        name: 'Demo User',
        email: 'demo@example.com',
      },
    });
    return 'fresh-token';
  };

  const output: string[] = [];
  console.log = (...args: unknown[]) => {
    output.push(args.map((arg) => String(arg)).join(' '));
  };

  statusCommand.exitOverride();
  await statusCommand.parseAsync(['node', 'status'], { from: 'node' });

  const rendered = output.join('\n');
  assert.match(rendered, new RegExp(t('auth.status.tokenValid')));
  assert.doesNotMatch(rendered, new RegExp(t('auth.status.tokenExpired')));
});
