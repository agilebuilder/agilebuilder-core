import assert from 'node:assert/strict';
import test from 'node:test';
import { withIsolatedDataDir } from '../../test-helpers/data-dir.js';
import { LocalResourceRepository } from '../../resources/local-repository.js';

type ResourcesModule = typeof import('./index.js');

async function loadResources(): Promise<ResourcesModule> {
  return import(`./index.js?t=${Date.now()}`) as Promise<ResourcesModule>;
}

async function readText(module: ResourcesModule, uri: string, spaceId = 'local'): Promise<string> {
  const result = await module.readMcpResource(uri, spaceId);
  return result.contents[0].text as string;
}

test('usage guide is an agent guide with workflow, tools, and error handbook', async () => {
  await withIsolatedDataDir(async () => {
    const module = await loadResources();
    const text = await readText(module, module.USAGE_GUIDE_URI);
    assert.match(text, /# AgileBuilder Agent Guide/);
    assert.match(text, /## Workspace model/);
    assert.match(text, /## Standard workflow/);
    assert.match(text, /### list_resources/);
    assert.match(text, /### search_resources/);
    assert.match(text, /### get_resource/);
    assert.match(text, /### create_project/);
    assert.match(text, /## Error handling/);
    for (const code of [
      'TEMPLATE_VARS_MISSING',
      'TARGET_NOT_EMPTY',
      'RESOURCE_NOT_FOUND',
      'CLOUD_WORKSPACE_REQUIRED',
      'PRO_ACCESS_REQUIRED',
      'AUTH_TOKEN_UNAVAILABLE',
    ]) {
      assert.ok(text.includes(code), `usage guide should mention ${code}`);
    }
  });
});

test('agent policy contains binding MUST / MUST NOT rules tied to params and error codes', async () => {
  await withIsolatedDataDir(async () => {
    const module = await loadResources();
    const text = await readText(module, module.AGENT_POLICY_URI);
    assert.match(text, /MUST/);
    assert.match(text, /MUST NOT/);
    assert.match(text, /allowHooks: true/);
    assert.match(text, /overwrite: true/);
    assert.match(text, /keepGit: true/);
    assert.match(text, /TEMPLATE_VARS_MISSING/);
    assert.match(text, /TARGET_NOT_EMPTY/);
    assert.match(text, /AUTH_TOKEN_UNAVAILABLE/);
    assert.match(text, /templateCommit/);
    assert.match(text, /filesWritten/);
  });
});

test('docs catalog lists local docs and templates with variable counts', async () => {
  await withIsolatedDataDir(async () => {
    const seedRepo = new LocalResourceRepository();
    await seedRepo.addDoc({ name: 'Team Guide', uri: 'local-doc://guide', content: 'hello guide', description: 'Coding rules' });
    const template = await seedRepo.addTemplate({ name: 'Web App', gitUrl: 'https://example.com/web.git', description: 'Web starter' });
    await seedRepo.saveTemplateVariables(template.id, [
      { name: 'projectName', type: 'input', message: 'Project name', required: true },
      { name: 'useAuth', type: 'confirm', message: 'Use auth', required: false, default: false },
    ]);

    const module = await loadResources();
    const text = await readText(module, module.DOCS_CATALOG_URI);
    assert.match(text, /## Docs/);
    assert.match(text, /\*\*Team Guide\*\* \(id: `\d+`\) — Coding rules/);
    assert.match(text, /## Templates/);
    assert.match(text, /\*\*Web App\*\* \(id: `\d+`, variables: 2\) — https:\/\/example\.com\/web\.git#main — Web starter/);
  });
});

test('docs catalog reports empty workspace sections', async () => {
  await withIsolatedDataDir(async () => {
    const module = await loadResources();
    const text = await readText(module, module.DOCS_CATALOG_URI);
    assert.match(text, /No local documents found\./);
    assert.match(text, /No local templates found\./);
  });
});
