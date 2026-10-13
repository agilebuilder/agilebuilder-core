import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../errors/app-error.js';
import { TokenStore } from '../auth/token-store.js';
import { ClientApi } from '../client/client-api.js';
import { withIsolatedDataDir } from '../test-helpers/data-dir.js';
import { deviceListResponse } from '../test-helpers/api-mocks.js';
import type { DeviceInfo } from '../client/client-api.js';

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

function sampleDevices(): DeviceInfo[] {
  return [
    {
      id: 'dev-current',
      deviceId: 'dev-current',
      deviceType: 'cli',
      deviceName: 'This Machine',
      status: 'active',
      isCurrent: true,
    },
    {
      id: 'dev-other',
      deviceId: 'dev-other',
      deviceType: 'web',
      deviceName: 'Browser',
      status: 'active',
      isCurrent: false,
    },
  ];
}

test('device list rejects when not logged in', async () => {
  await withIsolatedDataDir(async () => {
    const { createDeviceCommand } = await import('./device.js');
    const cmd = createDeviceCommand();
    await assert.rejects(
      cmd.parseAsync(['node', 'ag', 'list']),
      (err: unknown) => err instanceof AppError && (err as AppError).code === 'AUTH_TOKEN_UNAVAILABLE',
    );
  });
});

test('device list prints registered devices', async () => {
  await withIsolatedDataDir(async () => {
    TokenStore.saveApiKey('ak-device', { id: 'u1', name: 'Device User' });
    const original = ClientApi.listDevices;
    ClientApi.listDevices = async () => deviceListResponse(sampleDevices());
    const { logs, restore } = captureLogs();
    try {
      const { createDeviceCommand } = await import('./device.js');
      const cmd = createDeviceCommand();
      await cmd.parseAsync(['node', 'ag', 'list']);

      assert.match(logs[0] ?? '', /Devices \(/);
      assert.match(logs[0] ?? '', /This Machine/);
      assert.match(logs[0] ?? '', /Browser/);
    } finally {
      restore();
      ClientApi.listDevices = original;
      TokenStore.clear();
    }
  });
});

test('device list --json returns structured device data', async () => {
  await withIsolatedDataDir(async () => {
    TokenStore.saveApiKey('ak-device-json', { id: 'u1', name: 'Device JSON' });
    const original = ClientApi.listDevices;
    ClientApi.listDevices = async () => deviceListResponse(sampleDevices());
    const { logs, restore } = captureLogs();
    try {
      const { createDeviceCommand } = await import('./device.js');
      const cmd = createDeviceCommand();
      await cmd.parseAsync(['node', 'ag', 'list', '--json']);

      const parsed = JSON.parse(logs[0] ?? '{}');
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.devices.length, 2);
      assert.equal(parsed.data.total, 2);
      assert.equal(parsed.data.activeCount, 2);
    } finally {
      restore();
      ClientApi.listDevices = original;
      TokenStore.clear();
    }
  });
});

test('device list prints an empty-state message when no devices exist', async () => {
  await withIsolatedDataDir(async () => {
    TokenStore.saveApiKey('ak-device-empty', { id: 'u1', name: 'Device Empty' });
    const original = ClientApi.listDevices;
    ClientApi.listDevices = async () => deviceListResponse([]);
    const { logs, restore } = captureLogs();
    try {
      const { createDeviceCommand } = await import('./device.js');
      const cmd = createDeviceCommand();
      await cmd.parseAsync(['node', 'ag', 'list']);

      assert.match(logs[0] ?? '', /No registered devices found/);
    } finally {
      restore();
      ClientApi.listDevices = original;
      TokenStore.clear();
    }
  });
});

test('device list propagates API errors', async () => {
  await withIsolatedDataDir(async () => {
    TokenStore.saveApiKey('ak-device-err', { id: 'u1', name: 'Device Error' });
    const original = ClientApi.listDevices;
    ClientApi.listDevices = async () => {
      throw new AppError({ code: 'HTTP_500', message: 'Server error', category: 'network' });
    };
    try {
      const { createDeviceCommand } = await import('./device.js');
      const cmd = createDeviceCommand();
      await assert.rejects(
        cmd.parseAsync(['node', 'ag', 'list']),
        (err: unknown) => err instanceof AppError && (err as AppError).code === 'HTTP_500',
      );
    } finally {
      ClientApi.listDevices = original;
      TokenStore.clear();
    }
  });
});

test('device revoke rejects when not logged in', async () => {
  await withIsolatedDataDir(async () => {
    const { createDeviceCommand } = await import('./device.js');
    const cmd = createDeviceCommand();
    await assert.rejects(
      cmd.parseAsync(['node', 'ag', 'revoke', 'dev-other']),
      (err: unknown) => err instanceof AppError && (err as AppError).code === 'AUTH_TOKEN_UNAVAILABLE',
    );
  });
});

test('device revoke succeeds and prints confirmation', async () => {
  await withIsolatedDataDir(async () => {
    TokenStore.saveApiKey('ak-revoke', { id: 'u1', name: 'Revoke User' });
    const original = ClientApi.revokeDevice;
    ClientApi.revokeDevice = async () => ({ success: true });
    const { logs, restore } = captureLogs();
    try {
      const { createDeviceCommand } = await import('./device.js');
      const cmd = createDeviceCommand();
      await cmd.parseAsync(['node', 'ag', 'revoke', 'dev-other', '--json']);

      const parsed = JSON.parse(logs[0] ?? '{}');
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.revoked, true);
      assert.equal(parsed.data.deviceId, 'dev-other');
    } finally {
      restore();
      ClientApi.revokeDevice = original;
      TokenStore.clear();
    }
  });
});

test('device revoke-all rejects when not logged in', async () => {
  await withIsolatedDataDir(async () => {
    const { createDeviceCommand } = await import('./device.js');
    const cmd = createDeviceCommand();
    await assert.rejects(
      cmd.parseAsync(['node', 'ag', 'revoke-all']),
      (err: unknown) => err instanceof AppError && (err as AppError).code === 'AUTH_TOKEN_UNAVAILABLE',
    );
  });
});

test('device revoke-all succeeds and prints confirmation', async () => {
  await withIsolatedDataDir(async () => {
    TokenStore.saveApiKey('ak-revoke-all', { id: 'u1', name: 'Revoke All User' });
    const original = ClientApi.revokeAllOtherDevices;
    ClientApi.revokeAllOtherDevices = async () => ({ revokedCount: 3 });
    const { logs, restore } = captureLogs();
    try {
      const { createDeviceCommand } = await import('./device.js');
      const cmd = createDeviceCommand();
      await cmd.parseAsync(['node', 'ag', 'revoke-all', '--json']);

      const parsed = JSON.parse(logs[0] ?? '{}');
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.revokedAllOtherDevices, true);
    } finally {
      restore();
      ClientApi.revokeAllOtherDevices = original;
      TokenStore.clear();
    }
  });
});
