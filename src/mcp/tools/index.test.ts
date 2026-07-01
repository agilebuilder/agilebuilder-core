import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AppError } from '../../errors/app-error.js';
import { initGitRepo } from '../../test-helpers/git-fixture.js';
import { withIsolatedDataDir } from '../../test-helpers/data-dir.js';
import { LocalResourceRepository } from '../../resources/local-repository.js';
import { TemplateEngine } from '../../template/engine.js';

type ToolsModule = typeof import('./index.js');

async function loadTools(): Promise<ToolsModule> {
  // Dynamic import with a unique query string to avoid ESM cache across isolated dirs.
  return import(`./index.js?t=${Date.now()}`) as Promise<ToolsModule>;
}

function findSchema(tools: ToolsModule['toolSchemas'], name: string) {
  return tools.find((tool) => tool.name === name);
}

test('list_resources tool schema has additionalProperties false, enum and description', async () => {
  const { toolSchemas } = await loadTools();
  const schema = findSchema(toolSchemas, 'list_resources')!;
  assert.equal(schema.inputSchema.additionalProperties, false);
  assert.ok(schema.inputSchema.properties.type);
  assert.deepEqual(schema.inputSchema.properties.type.enum, ['template', 'doc']);
  assert.equal(typeof schema.inputSchema.properties.type.description, 'string');
});

test('get_resource tool schema has additionalProperties false, required and description', async () => {
  const { toolSchemas } = await loadTools();
  const schema = findSchema(toolSchemas, 'get_resource')!;
  assert.equal(schema.inputSchema.additionalProperties, false);
  assert.deepEqual(schema.inputSchema.required, ['resourceId']);
  assert.ok(schema.inputSchema.properties.resourceId);
  assert.equal(schema.inputSchema.properties.resourceId.type, 'string');
  assert.equal(typeof schema.inputSchema.properties.resourceId.description, 'string');
});

test('create_project tool schema has additionalProperties false, required and property descriptions', async () => {
  const { toolSchemas } = await loadTools();
  const schema = findSchema(toolSchemas, 'create_project')!;
  assert.equal(schema.inputSchema.additionalProperties, false);
  assert.deepEqual(schema.inputSchema.required, ['targetPath']);

  const properties = schema.inputSchema.properties;
  for (const key of Object.keys(properties)) {
    const prop = properties[key as keyof typeof properties];
    assert.ok(prop, `property ${key} should exist`);
    assert.equal(typeof prop.description, 'string', `property ${key} should have a description`);
  }

  assert.ok(properties.targetPath);
  assert.ok(properties.variables);
  assert.ok(properties.overwrite);
  assert.equal(properties.targetPath.type, 'string');
  assert.equal(properties.variables.type, 'object');
  assert.equal(properties.overwrite.type, 'boolean');
});

test('listResources returns local templates', async () => {
  await withIsolatedDataDir(async () => {
    const seedRepo = new LocalResourceRepository();
    await seedRepo.addTemplate({ name: 'Local Demo', gitUrl: 'https://example.com/demo.git' });

    const { listResources } = await loadTools();
    const result = await listResources({ type: 'template' });

    assert.equal(result.ok, true);
    assert.equal(result.data.workspaceId, 'local');
    assert.equal(result.data.total, 1);
    assert.equal(result.data.items[0].name, 'Local Demo');
  });
});

test('listResources filters by keyword', async () => {
  await withIsolatedDataDir(async () => {
    const seedRepo = new LocalResourceRepository();
    await seedRepo.addTemplate({ name: 'Alpha', gitUrl: 'https://example.com/alpha.git' });
    await seedRepo.addTemplate({ name: 'Beta', gitUrl: 'https://example.com/beta.git' });

    const { listResources } = await loadTools();
    const result = await listResources({ keyword: 'alpha' });

    assert.equal(result.data.total, 1);
    assert.equal(result.data.items[0].name, 'Alpha');
  });
});

test('getResource returns a local resource by id', async () => {
  await withIsolatedDataDir(async () => {
    const seedRepo = new LocalResourceRepository();
    const created = await seedRepo.addTemplate({ name: 'Get Demo', gitUrl: 'https://example.com/get.git' });

    const { getResource } = await loadTools();
    const result = await getResource({ resourceId: created.id });

    assert.equal(result.ok, true);
    assert.equal(result.data.id, created.id);
    assert.equal(result.data.name, 'Get Demo');
  });
});

test('getResource throws RESOURCE_ID_REQUIRED when resourceId is missing', async () => {
  await withIsolatedDataDir(async () => {
    const { getResource } = await loadTools();
    await assert.rejects(
      () => getResource({}),
      (error) => error instanceof AppError && error.code === 'RESOURCE_ID_REQUIRED',
    );
  });
});

test('getResource throws RESOURCE_NOT_FOUND for unknown local id', async () => {
  await withIsolatedDataDir(async () => {
    const { getResource } = await loadTools();
    await assert.rejects(
      () => getResource({ resourceId: '999' }),
      (error) => error instanceof AppError && error.code === 'RESOURCE_NOT_FOUND',
    );
  });
});

test('createProject creates a project from a gitUrl', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'ag-core1-mcp-create-'));
  try {
    await withIsolatedDataDir(async () => {
      const repoDir = join(baseDir, 'repo');
      const targetDir = join(baseDir, 'target');
      await initGitRepo(repoDir, [
        { path: '.agilebuilder.config.yaml', content: 'version: "1.0"\nvariables:\n  enabled: false\n' },
        { path: 'hello.txt', content: 'Hello World' },
      ]);

      const { createProject } = await loadTools();
      const result = await createProject({ gitUrl: repoDir, targetPath: targetDir });

      assert.equal(result.ok, true);
      assert.equal(result.data.success, true);
      assert.equal(result.data.targetDir, targetDir);
      const content = await readFile(join(targetDir, 'hello.txt'), 'utf8');
      assert.equal(content, 'Hello World');
    });
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test('createProject creates a project from a local resource id', async () => {
  const originalGenerate = TemplateEngine.prototype.generateFromGit;
  TemplateEngine.prototype.generateFromGit = async (options) => ({
    success: true as const,
    targetDir: options.targetDir,
    filesWritten: ['mock.txt'],
    filesSkipped: [],
    variables: options.variables ?? {},
  });

  try {
    await withIsolatedDataDir(async () => {
      const seedRepo = new LocalResourceRepository();
      const created = await seedRepo.addTemplate({ name: 'Res Demo', gitUrl: 'https://example.com/res.git' });

      const { createProject } = await loadTools();
      const result = await createProject({ resourceId: created.id, targetPath: '/tmp/target' });

      assert.equal(result.ok, true);
      assert.equal(result.data.success, true);
      assert.equal(result.data.targetDir, '/tmp/target');
    });
  } finally {
    TemplateEngine.prototype.generateFromGit = originalGenerate;
  }
});

test('createProject throws TARGET_PATH_REQUIRED when targetPath is missing', async () => {
  await withIsolatedDataDir(async () => {
    const { createProject } = await loadTools();
    await assert.rejects(
      () => createProject({ gitUrl: 'https://example.com/repo.git' }),
      (error) => error instanceof AppError && error.code === 'TARGET_PATH_REQUIRED',
    );
  });
});

test('createProject throws CREATE_SOURCE_REQUIRED when neither resourceId nor gitUrl is provided', async () => {
  await withIsolatedDataDir(async () => {
    const { createProject } = await loadTools();
    await assert.rejects(
      () => createProject({ targetPath: '/tmp/target' }),
      (error) => error instanceof AppError && error.code === 'CREATE_SOURCE_REQUIRED',
    );
  });
});

test('createProject throws INVALID_VARIABLES for non-object variables', async () => {
  await withIsolatedDataDir(async () => {
    const { createProject } = await loadTools();
    await assert.rejects(
      () => createProject({ gitUrl: 'https://example.com/repo.git', targetPath: '/tmp/target', variables: ['x'] }),
      (error) => error instanceof AppError && error.code === 'INVALID_VARIABLES',
    );
  });
});
