import { createServer } from 'net';
import {
  OAUTH_CALLBACK_PORT,
  OAUTH_CALLBACK_PORT_MAX_ATTEMPTS,
} from '../shared/constants.js';
import { t } from '../i18n/index.js';

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, '127.0.0.1');
  });
}

export async function findAvailablePort(): Promise<number> {
  const basePort = OAUTH_CALLBACK_PORT;
  const maxAttempts = OAUTH_CALLBACK_PORT_MAX_ATTEMPTS;

  for (let i = 0; i < maxAttempts; i++) {
    const port = basePort + i;
    const available = await isPortAvailable(port);

    if (available) {
      return port;
    }
  }

  throw new Error(t('auth.portUnavailable', {
    from: basePort,
    to: basePort + maxAttempts - 1,
  }));
}

export function getCallbackUrl(port: number): string {
  return `http://127.0.0.1:${port}/callback`;
}
