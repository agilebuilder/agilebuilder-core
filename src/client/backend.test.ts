import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { ConfigStore } from '../config/store.js';

test('backend endpoints support china/global specific environment variables', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-backend-'));
  const oldDataDir = process.env.AGILEBUILDER_CORE1_DATA_DIR;
  const oldChinaSsoWeb = process.env.AG_BACKEND_CHINA_SSO_WEB_URL;
  const oldChinaSso = process.env.AG_BACKEND_CHINA_SSO_URL;
  const oldChinaWorkspace = process.env.AG_BACKEND_CHINA_WORKSPACE_URL;
  const oldGlobalSsoWeb = process.env.AG_BACKEND_GLOBAL_SSO_WEB_URL;
  const oldGlobalSso = process.env.AG_BACKEND_GLOBAL_SSO_URL;
  const oldGlobalWorkspace = process.env.AG_BACKEND_GLOBAL_WORKSPACE_URL;
  const oldGenericSsoWeb = process.env.AGILEBUILDER_SSO_WEB_URL;
  const oldGenericSsoApi = process.env.AGILEBUILDER_SSO_API_URL;
  const oldGenericWorkspace = process.env.AGILEBUILDER_WORKSPACE_URL;

  process.env.AGILEBUILDER_CORE1_DATA_DIR = dir;
  process.env.AG_BACKEND_CHINA_SSO_WEB_URL = 'https://auth.agilebuilder.cn';
  process.env.AG_BACKEND_CHINA_SSO_URL = 'https://api-auth.agilebuilder.cn';
  process.env.AG_BACKEND_CHINA_WORKSPACE_URL = 'https://api-app.agilebuilder.cn';
  process.env.AG_BACKEND_GLOBAL_SSO_WEB_URL = 'https://auth.agilebuilder.net';
  process.env.AG_BACKEND_GLOBAL_SSO_URL = 'https://api-auth.agilebuilder.net';
  process.env.AG_BACKEND_GLOBAL_WORKSPACE_URL = 'https://api-app.agilebuilder.net';
  delete process.env.AGILEBUILDER_SSO_WEB_URL;
  delete process.env.AGILEBUILDER_SSO_API_URL;
  delete process.env.AGILEBUILDER_WORKSPACE_URL;

  try {
    let backend = await import(`./backend.js?case=china-${Date.now()}`);
    ConfigStore.set('backend.profile', 'china');
    assert.deepEqual(backend.getBackendEndpoints(), {
      ssoWebUrl: 'https://auth.agilebuilder.cn',
      ssoApiUrl: 'https://api-auth.agilebuilder.cn',
      workspaceUrl: 'https://api-app.agilebuilder.cn',
    });

    backend = await import(`./backend.js?case=global-${Date.now()}`);
    ConfigStore.set('backend.profile', 'global');
    assert.deepEqual(backend.getBackendEndpoints(), {
      ssoWebUrl: 'https://auth.agilebuilder.net',
      ssoApiUrl: 'https://api-auth.agilebuilder.net',
      workspaceUrl: 'https://api-app.agilebuilder.net',
    });
  } finally {
    restoreEnv('AGILEBUILDER_CORE1_DATA_DIR', oldDataDir);
    restoreEnv('AG_BACKEND_CHINA_SSO_WEB_URL', oldChinaSsoWeb);
    restoreEnv('AG_BACKEND_CHINA_SSO_URL', oldChinaSso);
    restoreEnv('AG_BACKEND_CHINA_WORKSPACE_URL', oldChinaWorkspace);
    restoreEnv('AG_BACKEND_GLOBAL_SSO_WEB_URL', oldGlobalSsoWeb);
    restoreEnv('AG_BACKEND_GLOBAL_SSO_URL', oldGlobalSso);
    restoreEnv('AG_BACKEND_GLOBAL_WORKSPACE_URL', oldGlobalWorkspace);
    restoreEnv('AGILEBUILDER_SSO_WEB_URL', oldGenericSsoWeb);
    restoreEnv('AGILEBUILDER_SSO_API_URL', oldGenericSsoApi);
    restoreEnv('AGILEBUILDER_WORKSPACE_URL', oldGenericWorkspace);
    await rm(dir, { recursive: true, force: true });
  }
});

test('backend endpoint overrides fail fast when only partially configured', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-backend-partial-'));
  const oldDataDir = process.env.AGILEBUILDER_CORE1_DATA_DIR;
  const oldGenericSsoWeb = process.env.AGILEBUILDER_SSO_WEB_URL;
  const oldGenericSsoApi = process.env.AGILEBUILDER_SSO_API_URL;
  const oldGenericWorkspace = process.env.AGILEBUILDER_WORKSPACE_URL;

  process.env.AGILEBUILDER_CORE1_DATA_DIR = dir;
  process.env.AGILEBUILDER_SSO_WEB_URL = 'https://auth.agilebuilder.cn';
  delete process.env.AGILEBUILDER_SSO_API_URL;
  delete process.env.AGILEBUILDER_WORKSPACE_URL;

  try {
    const backend = await import(`./backend.js?case=partial-${Date.now()}`);
    assert.throws(() => backend.getBackendEndpoints(), /Incomplete backend configuration/);
  } finally {
    restoreEnv('AGILEBUILDER_CORE1_DATA_DIR', oldDataDir);
    restoreEnv('AGILEBUILDER_SSO_WEB_URL', oldGenericSsoWeb);
    restoreEnv('AGILEBUILDER_SSO_API_URL', oldGenericSsoApi);
    restoreEnv('AGILEBUILDER_WORKSPACE_URL', oldGenericWorkspace);
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
