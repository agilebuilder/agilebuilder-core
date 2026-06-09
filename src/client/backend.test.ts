import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { ConfigStore } from '../config/store.js';

test('backend endpoints always resolve to built-in official services', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-backend-'));
  const oldDataDir = process.env.AGILEBUILDER_CORE1_DATA_DIR;
  const oldGenericSsoWeb = process.env.AGILEBUILDER_SSO_WEB_URL;
  const oldGenericSsoApi = process.env.AGILEBUILDER_SSO_API_URL;
  const oldGenericWorkspace = process.env.AGILEBUILDER_WORKSPACE_URL;
  const oldChinaSsoWeb = process.env.AG_BACKEND_CHINA_SSO_WEB_URL;
  const oldChinaSso = process.env.AG_BACKEND_CHINA_SSO_URL;
  const oldChinaWorkspace = process.env.AG_BACKEND_CHINA_WORKSPACE_URL;
  const oldGlobalSsoWeb = process.env.AG_BACKEND_GLOBAL_SSO_WEB_URL;
  const oldGlobalSso = process.env.AG_BACKEND_GLOBAL_SSO_URL;
  const oldGlobalWorkspace = process.env.AG_BACKEND_GLOBAL_WORKSPACE_URL;

  process.env.AGILEBUILDER_CORE1_DATA_DIR = dir;
  process.env.AGILEBUILDER_SSO_WEB_URL = 'https://third-party.example/auth';
  process.env.AGILEBUILDER_SSO_API_URL = 'https://third-party.example/api-auth';
  process.env.AGILEBUILDER_WORKSPACE_URL = 'https://third-party.example/workspace';
  process.env.AG_BACKEND_CHINA_SSO_WEB_URL = 'https://third-party.example/china-auth';
  process.env.AG_BACKEND_CHINA_SSO_URL = 'https://third-party.example/china-api-auth';
  process.env.AG_BACKEND_CHINA_WORKSPACE_URL = 'https://third-party.example/china-workspace';
  process.env.AG_BACKEND_GLOBAL_SSO_WEB_URL = 'https://third-party.example/global-auth';
  process.env.AG_BACKEND_GLOBAL_SSO_URL = 'https://third-party.example/global-api-auth';
  process.env.AG_BACKEND_GLOBAL_WORKSPACE_URL = 'https://third-party.example/global-workspace';

  try {
    const backend = await import(`./backend.js?case=official-${Date.now()}`);

    ConfigStore.set('backend.profile', 'china');
    assert.deepEqual(backend.getBackendEndpoints(), {
      websiteUrl: 'https://www.agilebuilder.cn',
      ssoWebUrl: 'https://api-auth.agilebuilder.cn',
      ssoApiUrl: 'https://api-auth.agilebuilder.cn',
      workspaceUrl: 'https://api-app.agilebuilder.cn',
    });

    ConfigStore.set('backend.profile', 'global');
    assert.deepEqual(backend.getBackendEndpoints(), {
      websiteUrl: 'https://www.agilebuilder.net',
      ssoWebUrl: 'https://api-auth.agilebuilder.net',
      ssoApiUrl: 'https://api-auth.agilebuilder.net',
      workspaceUrl: 'https://api-app.agilebuilder.net',
    });
  } finally {
    restoreEnv('AGILEBUILDER_CORE1_DATA_DIR', oldDataDir);
    restoreEnv('AGILEBUILDER_SSO_WEB_URL', oldGenericSsoWeb);
    restoreEnv('AGILEBUILDER_SSO_API_URL', oldGenericSsoApi);
    restoreEnv('AGILEBUILDER_WORKSPACE_URL', oldGenericWorkspace);
    restoreEnv('AG_BACKEND_CHINA_SSO_WEB_URL', oldChinaSsoWeb);
    restoreEnv('AG_BACKEND_CHINA_SSO_URL', oldChinaSso);
    restoreEnv('AG_BACKEND_CHINA_WORKSPACE_URL', oldChinaWorkspace);
    restoreEnv('AG_BACKEND_GLOBAL_SSO_WEB_URL', oldGlobalSsoWeb);
    restoreEnv('AG_BACKEND_GLOBAL_SSO_URL', oldGlobalSso);
    restoreEnv('AG_BACKEND_GLOBAL_WORKSPACE_URL', oldGlobalWorkspace);
    await rm(dir, { recursive: true, force: true });
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
