import http from 'node:http';
import { URL } from 'node:url';
import open from 'open';
import { AppError } from '../errors/app-error.js';
import { getBackendEndpoints } from '../client/backend.js';
import { generatePKCE, generateState } from './pkce.js';
import { TokenStore } from './token-store.js';
import type { OAuthTokenResponse, UserInfo } from './types.js';

const OAUTH_CLIENT_ID = 'agilebuilder-cli';
const CALLBACK_HOST = '127.0.0.1';
const CALLBACK_PORT = 51280;

async function findAvailablePort(start = CALLBACK_PORT, attempts = 10): Promise<number> {
  for (let port = start; port < start + attempts; port++) {
    const available = await new Promise<boolean>((resolve) => {
      const server = http.createServer();
      server.once('error', () => resolve(false));
      server.listen(port, CALLBACK_HOST, () => {
        server.close(() => resolve(true));
      });
    });
    if (available) return port;
  }
  throw new AppError({
    code: 'OAUTH_PORT_UNAVAILABLE',
    message: 'No available local callback port for OAuth login.',
    category: 'auth',
  });
}

async function exchangeCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<OAuthTokenResponse> {
  const response = await fetch(`${getBackendEndpoints().ssoApiUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: input.code,
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new AppError({
      code: `HTTP_${response.status}`,
      message: await response.text(),
      category: 'auth',
    });
  }

  const raw = await response.json() as Record<string, unknown>;
  return (raw.data || raw) as OAuthTokenResponse;
}

function html(message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>AgileBuilder</title><body style="font-family:sans-serif;padding:32px">${message}</body>`;
}

export async function oauthLogin(onAuthUrl?: (url: string) => void): Promise<UserInfo> {
  const port = await findAvailablePort();
  const redirectUri = `http://${CALLBACK_HOST}:${port}/callback`;
  const pkce = generatePKCE();
  const state = generateState();
  const authUrl = new URL(`${getBackendEndpoints().ssoWebUrl}/oauth/authorize`);
  authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', pkce.codeChallenge);
  authUrl.searchParams.set('code_challenge_method', pkce.codeChallengeMethod);
  onAuthUrl?.(authUrl.toString());

  return await new Promise<UserInfo>((resolve, reject) => {
    let settled = false;
    const server = http.createServer(async (req, res) => {
      if (settled) return;
      const reqUrl = new URL(req.url || '/', redirectUri);
      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      const returnedState = reqUrl.searchParams.get('state');
      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error_description') || reqUrl.searchParams.get('error');
      try {
        if (error) throw new Error(error);
        if (returnedState !== state) throw new Error('OAuth state mismatch.');
        if (!code) throw new Error('OAuth code is missing.');
        const token = await exchangeCode({ code, codeVerifier: pkce.codeVerifier, redirectUri });
        const auth = TokenStore.saveOAuth(token);
        settled = true;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html('AgileBuilder login succeeded. You can close this window.'));
        server.close();
        resolve(auth.user);
      } catch (caught) {
        settled = true;
        const message = caught instanceof Error ? caught.message : String(caught);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html(`AgileBuilder login failed: ${message}`));
        server.close();
        reject(caught);
      }
    });

    server.listen(port, CALLBACK_HOST, async () => {
      try {
        await open(authUrl.toString());
      } catch {
        // Manual URL is already printed by caller.
      }
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        server.close();
        reject(new AppError({ code: 'OAUTH_TIMEOUT', message: 'OAuth login timed out.', category: 'auth' }));
      }
    }, 180_000).unref();
  });
}
