import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { AppError } from '../../errors/app-error.js';
import { initGitRepo, git } from '../../test-helpers/git-fixture.js';
import { withIsolatedDataDir } from '../../test-helpers/data-dir.js';
import { LocalResourceRepository } from '../../resources/local-repository.js';
import { TemplateEngine } from '../../template/engine.js';

const execFileAsync = promisify(execFile);

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
    const created = await seedRepo.addTemplate({ name: 'Get Demo', gitUrl: join(tmpdir(), 'ag-core1-missing-repo-for-get') });

    const { getResource } = await loadTools();
    const result = await getResource({ resourceId: created.id });

    assert.equal(result.ok, true);
    assert.equal(result.data.id, created.id);
    assert.equal(result.data.name, 'Get Demo');
    assert.equal((result.data as { variables?: unknown }).variables, undefined);
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

test('all tools have title, annotations, and multi-sentence descriptions', async () => {
  const { toolSchemas } = await loadTools();
  assert.equal(toolSchemas.length, 4);
  for (const schema of toolSchemas) {
    assert.equal(typeof schema.title, 'string', `${schema.name} should have a title`);
    assert.ok(schema.annotations, `${schema.name} should have annotations`);
    assert.ok(schema.description.length > 80, `${schema.name} should have a detailed description`);
  }

  const readOnly = ['list_resources', 'search_resources', 'get_resource'];
  for (const name of readOnly) {
    const schema = findSchema(toolSchemas, name)!;
    assert.equal((schema.annotations as { readOnlyHint?: boolean }).readOnlyHint, true, `${name} should be read-only`);
  }

  const create = findSchema(toolSchemas, 'create_project')!;
  const annotations = create.annotations as { destructiveHint?: boolean; openWorldHint?: boolean };
  assert.equal(annotations.destructiveHint, false);
  assert.equal(annotations.openWorldHint, true);
});

test('createProject result includes the template commit hash', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'ag-core1-mcp-commit-'));
  try {
    await withIsolatedDataDir(async () => {
      const repoDir = join(baseDir, 'repo');
      const targetDir = join(baseDir, 'target');
      await initGitRepo(repoDir, [{ path: 'hello.txt', content: 'Hello' }]);
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoDir });

      const { createProject } = await loadTools();
      const result = await createProject({ gitUrl: repoDir, targetPath: targetDir });

      assert.equal(result.ok, true);
      assert.equal(result.data.templateCommit, stdout.trim());
    });
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test('getResource lazily resolves and caches template variables for local templates', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'ag-core1-mcp-vars-'));
  try {
    await withIsolatedDataDir(async () => {
      const repoDir = join(baseDir, 'repo');
      await initGitRepo(repoDir, [
        {
          path: '.agilebuilder.config.yaml',
          content: [
            'version: "1.0"',
            'variables:',
            '  enabled: true',
            '  inquirerQuestions:',
            '    - name: projectName',
            '      type: input',
            '      message: Project name',
            '      required: true',
            '    - name: useAuth',
            '      type: confirm',
            '      message: Enable auth',
            '      default: false',
            '',
          ].join('\n'),
        },
        { path: 'hello.txt', content: 'Hello' },
      ]);
      await git(repoDir, ['branch', '-M', 'main']);
      const seedRepo = new LocalResourceRepository();
      const created = await seedRepo.addTemplate({ name: 'Vars Demo', gitUrl: repoDir });

      const { getResource } = await loadTools();
      const first = await getResource({ resourceId: created.id });
      assert.equal(first.ok, true);
      const variables = (first.data as { variables?: Array<{ name: string; type: string; required: boolean; default?: unknown }> }).variables;
      assert.ok(variables);
      assert.equal(variables.length, 2);
      assert.equal(variables[0].name, 'projectName');
      assert.equal(variables[0].required, true);
      assert.equal(variables[1].name, 'useAuth');
      assert.equal(variables[1].required, false);
      assert.equal(variables[1].default, false);

      const stored = await seedRepo.get(created.id);
      assert.equal(stored?.type, 'template');
      assert.equal(stored?.type === 'template' ? stored.variables?.length : 0, 2);

      const second = await getResource({ resourceId: created.id });
      assert.equal((second.data as { variables?: unknown[] }).variables?.length, 2);
    });
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});
