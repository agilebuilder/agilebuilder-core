import { Command } from 'commander';
import { ClientApi } from '../client/client-api.js';
import { AppError } from '../errors/app-error.js';
import { writeSuccess } from '../output/format.js';
import { TokenStore } from '../auth/token-store.js';
import { t } from '../i18n/index.js';
import {
  renderDeviceList,
  renderDeviceRevoke,
  renderDeviceRevokeAll,
} from '../output/cli-renderers.js';

interface JsonOption {
  json?: boolean;
}

async function requireToken(): Promise<string> {
  const token = await TokenStore.getValidToken();
  if (!token) {
    throw new AppError({
      code: 'AUTH_TOKEN_UNAVAILABLE',
      message: 'Login is required for device management.',
      suggestion: 'Run ag login or ag login --api-key <key>.',
      category: 'auth',
    });
  }
  return token;
}

export function createDeviceCommand(): Command {
  const command = new Command('device')
    .description(t('device.description'));

  command
    .command('list')
    .alias('ls')
    .description(t('device.list.description'))
    .option('--json', 'Output JSON')
    .action(async (options: JsonOption) => {
      const token = await requireToken();
      writeSuccess(await ClientApi.listDevices(token), options, renderDeviceList);
    });

  command
    .command('revoke')
    .argument('<device-id>')
    .description(t('device.revoke.description'))
    .option('--reason <text>', 'Revoke reason')
    .option('--json', 'Output JSON')
    .action(async (deviceId: string, options: JsonOption & { reason?: string }) => {
      const token = await requireToken();
      const result = await ClientApi.revokeDevice(token, deviceId, options.reason);
      writeSuccess({ revoked: true, deviceId, result }, options, renderDeviceRevoke);
    });

  command
    .command('revoke-all')
    .description(t('device.revokeAll.description'))
    .option('--json', 'Output JSON')
    .action(async (options: JsonOption) => {
      const token = await requireToken();
      const result = await ClientApi.revokeAllOtherDevices(token);
      writeSuccess({ revokedAllOtherDevices: true, result }, options, renderDeviceRevokeAll);
    });

  return command;
}
