import { createHash, randomBytes } from 'node:crypto';

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function generateState(): string {
  return base64Url(randomBytes(24));
}

export function generatePKCE(): {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
} {
  const codeVerifier = base64Url(randomBytes(32));
  const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}
