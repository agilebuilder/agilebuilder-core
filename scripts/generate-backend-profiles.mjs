import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const envPath = join(rootDir, '.env');
const envLocalPath = join(rootDir, '.env.local');
const targetFile = join(rootDir, 'src', 'config', 'backend-profiles.ts');

if (existsSync(envPath)) {
  loadEnv({ path: envPath, quiet: true, override: false });
}

if (existsSync(envLocalPath)) {
  loadEnv({ path: envLocalPath, quiet: true, override: true });
}

function getEnvValue(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

const chinaSsoUrl = getEnvValue('AG_BACKEND_CHINA_SSO_URL');
const chinaWorkspaceUrl = getEnvValue('AG_BACKEND_CHINA_WORKSPACE_URL');
const globalSsoUrl = getEnvValue('AG_BACKEND_GLOBAL_SSO_URL');
const globalWorkspaceUrl = getEnvValue('AG_BACKEND_GLOBAL_WORKSPACE_URL');

const missingEnvNames = [
  !chinaSsoUrl ? 'AG_BACKEND_CHINA_SSO_URL' : null,
  !chinaWorkspaceUrl ? 'AG_BACKEND_CHINA_WORKSPACE_URL' : null,
  !globalSsoUrl ? 'AG_BACKEND_GLOBAL_SSO_URL' : null,
  !globalWorkspaceUrl ? 'AG_BACKEND_GLOBAL_WORKSPACE_URL' : null,
].filter(Boolean);

if (missingEnvNames.length > 0) {
  throw new Error(`Missing required backend env variables: ${missingEnvNames.join(', ')}`);
}

function escapeString(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const content = `export type BackendProfile = 'china' | 'global';
export type BackendProfileSetting = 'auto' | BackendProfile;

export interface BackendEndpoints {
  ssoUrl: string;
  workspaceUrl: string;
}

export const BACKEND_PROFILE_ENDPOINTS: Record<BackendProfile, BackendEndpoints> = {
  china: {
    ssoUrl: '${escapeString(chinaSsoUrl)}',
    workspaceUrl: '${escapeString(chinaWorkspaceUrl)}',
  },
  global: {
    ssoUrl: '${escapeString(globalSsoUrl)}',
    workspaceUrl: '${escapeString(globalWorkspaceUrl)}',
  },
};
`;

const currentContent = existsSync(targetFile) ? readFileSync(targetFile, 'utf-8') : '';

if (currentContent !== content) {
  writeFileSync(targetFile, content, 'utf-8');
  console.log(`[backend-profiles] Generated ${targetFile}`);
} else {
  console.log('[backend-profiles] No changes needed');
}
