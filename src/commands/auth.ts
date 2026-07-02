import { Command } from 'commander';
import { ClientApi } from '../client/client-api.js';
import { AppError } from '../errors/app-error.js';
import { writeSuccess } from '../output/format.js';
import { TokenStore } from '../auth/token-store.js';
import { oauthLogin } from '../auth/oauth-login.js';
import { t } from '../i18n/index.js';
import {
  renderAuthStatus,
  renderLogin,
  renderLogout,
  renderTokenAvailable,
} from '../output/cli-renderers.js';

interface JsonOption {
  json?: boolean;
}

interface LoginOptions extends JsonOption {
  apiKey?: string;
}

async function apiKeyLogin(apiKey: string) {
  const user = await ClientApi.getUserProfile(apiKey);
  TokenStore.saveApiKey(apiKey, user);
  // Best-effort device registration; the backend may not expose this endpoint
  // in all environments, so failures are intentionally ignored.
  await ClientApi.registerDevice(apiKey).catch(() => undefined);
  return user;
}

export function createLoginCommand(): Command {
  return new Command('login')
    .description(t('auth.command.description'))
    .option('--api-key <key>', 'Use API key authentication')
    .option('--json', 'Output JSON')
    .action(async (options: LoginOptions) => {
      if (options.apiKey === '') {
        throw new AppError({
          code: 'API_KEY_REQUIRED',
          message: 'API key cannot be empty.',
          suggestion: 'Use --api-key <key> with a non-empty key, or omit the flag to use OAuth.',
          category: 'validation',
        });
      }
      const user = options.apiKey
        ? await apiKeyLogin(options.apiKey)
        : await oauthLogin((url) => {
            if (!options.json) {
              console.log(`Open this URL if the browser does not open automatically:\n${url}`);
            }
          });
      writeSuccess({ user }, options, renderLogin);
    });
}

export function createLogoutCommand(): Command {
  return new Command('logout')
    .description(t('auth.logout.description'))
    .option('--json', 'Output JSON')
    .action((options: JsonOption) => {
      TokenStore.clear();
      writeSuccess({ loggedOut: true }, options, renderLogout);
    });
}

export function createAuthCommand(): Command {
  const command = new Command('auth')
    .description(t('auth.description'));

  command
    .command('status')
    .description(t('auth.status.description'))
    .option('--json', 'Output JSON')
    .action(async (options: JsonOption) => {
      const auth = TokenStore.load();
      const token = await TokenStore.getValidToken();
      writeSuccess({
        loggedIn: !!auth && !!token,
        authType: auth?.authType ?? null,
        user: auth?.user ?? null,
      }, options, renderAuthStatus);
    });

  command
    .command('require-token')
    .description(t('auth.requireToken.description'))
    .option('--json', 'Output JSON')
    .action(async (options: JsonOption) => {
      const token = await TokenStore.getValidToken();
      if (!token) {
        throw new AppError({ code: 'AUTH_TOKEN_UNAVAILABLE', message: t('auth.noValidToken'), category: 'auth' });
      }
      writeSuccess({ available: true }, options, renderTokenAvailable);
    });

  // for GUI Sidecar
  command
    .command('token', { hidden: true })
    .description(t('auth.token.description'))
    .option('--json', 'Output JSON')
    .action(async (options: JsonOption) => {
      const token = await TokenStore.getValidToken();
      if (!token) {
        throw new AppError({ code: 'AUTH_TOKEN_UNAVAILABLE', message: t('auth.noValidToken'), category: 'auth' });
      }
      writeSuccess({ token }, options);
    });

  return command;
}
