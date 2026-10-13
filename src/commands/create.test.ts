import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import test from 'node:test';
import { createCreateCommand } from './create.js';
import { LocalResourceRepository } from '../resources/local-repository.js';
import { TokenStore } from '../auth/token-store.js';
import { ClientApi } from '../client/client-api.js';
import { WorkspaceStore } from '../workspace/store.js';
import { ConfigStore } from '../config/store.js';
import { withIsolatedDataDir } from '../test-helpers/data-dir.js';
import {
  createTemplateRepo,
  minimalTemplateFiles,
  minimalYamlConfig,
} from '../test-helpers/template-fixture.js';
import { runCli } from '../test-helpers/run-cli.js';
import type { CloudResourceDetail } from '../client/client-api.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

async function createTemplateRepoWithMain(
  repoDir: string,
  options: Parameters<typeof createTemplateRepo>[1] = {},
): Promise<void> {
  await createTemplateRepo(repoDir, options);
  await git(repoDir, ['branch', '-m', 'main']);
}

const originalGetValidToken = TokenStore.getValidToken;
const originalGetResourceDetail = ClientApi.getResourceDetail;
const originalRecordResourceAccess = ClientApi.recordResourceAccess;

test.afterEach(() => {
  TokenStore.getValidToken = originalGetValidToken;
  ClientApi.getResourceDetail = originalGetResourceDetail;
  ClientApi.recordResourceAccess = originalRecordResourceAccess;
});

function captureOutput(): {
  logs: string[];
  errors: string[];
  restore: () => void;
} {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(' '));
  return { logs, errors, restore: () => { console.log = originalLog; console.error = originalError; } };
}

function unsafeRoot(): string {
  return process.platform === 'win32' ? 'C:\\' : '/';
}

function cloudTemplateResource(
  id: string,
  spaceId: string,
  repo: string,
): CloudResourceDetail {
  const now = new Date(0).toISOString();
  return {
    id,
    spaceId,
    name: id,
    type: 'template',
    createdAt: now,
    updatedAt: now,
    template: {
      gitRepo: repo,
      gitBranch: 'main',
      definition: {
        configSource: 'workspace',
        source: {
          type: 'git',
          git: { repo, branch: 'main' },
        },
        variables: {
          enabled: true,
          delimiter: '%',
          filePatterns: { mode: 'include', patterns: ['**/*.txt'] },
          inquirerQuestions: [
            { name: 'projectName', type: 'input', message: 'Project name', required: true },
          ],
        },
        hooks: {},
      },
    },
  };
}

test('create from a local resource id succeeds and renders JSON', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const repo = join(base, 'repo');
    const target = join(base, 'target');
    await createTemplateRepoWithMain(repo, { config: minimalYamlConfig, files: minimalTemplateFiles });

    const localRepo = new LocalResourceRepository();
    const resource = await localRepo.addTemplate({ name: 'demo', gitUrl: repo, branch: 'main' });

    const command = createCreateCommand();
    const output = captureOutput();
    try {
      await command.parseAsync(['node', 'test', resource.id, '--target', target, '--var', 'projectName=myapp', '--json']);
    } finally {
      output.restore();
    }

    const parsed = JSON.parse(output.logs[0]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.targetDir, target);
    assert.ok(parsed.data.filesWritten.includes('myapp.txt'));
    assert.equal((await readFile(join(target, 'myapp.txt'), 'utf8')).trim(), 'Hello myapp');
  });
});

test('create from --git-url without --branch succeeds with text output', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const repo = join(base, 'repo');
    const target = join(base, 'target');
    await createTemplateRepoWithMain(repo, { config: minimalYamlConfig, files: minimalTemplateFiles });

    const command = createCreateCommand();
    const output = captureOutput();
    try {
      await command.parseAsync(['node', 'test', '--git-url', repo, '--target', target, '--var', 'projectName=fromgit']);
    } finally {
      output.restore();
    }

    assert.match(output.logs.join('\n'), /Project created successfully/);
    assert.equal((await readFile(join(target, 'fromgit.txt'), 'utf8')).trim(), 'Hello fromgit');
  });
});

test('create from --git-url with --branch and --subdir succeeds', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const repo = join(base, 'repo');
    const target = join(base, 'target');
    const subdir = 'template';
    await createTemplateRepoWithMain(repo, {
      files: [
        { path: `${subdir}/.agilebuilder.config.yaml`, content: minimalYamlConfig },
        { path: `${subdir}/{{ projectName }}.txt`, content: 'Hello <%= projectName %>\n' },
      ],
    });

    const command = createCreateCommand();
    const output = captureOutput();
    try {
      await command.parseAsync(['node', 'test', '--git-url', repo, '--branch', 'main', '--subdir', subdir, '--target', target, '--var', 'projectName=subapp', '--json']);
    } finally {
      output.restore();
    }

    const parsed = JSON.parse(output.logs[0]);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.data.filesWritten.includes('subapp.txt'));
    assert.equal((await readFile(join(target, 'subapp.txt'), 'utf8')).trim(), 'Hello subapp');
  });
});

test('create without source throws CREATE_SOURCE_REQUIRED', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const target = join(base, 'target');
    const command = createCreateCommand();
    await assert.rejects(
      () => command.parseAsync(['node', 'test', '--target', target]),
      (error) => error instanceof Error && 'code' in error && error.code === 'CREATE_SOURCE_REQUIRED',
    );
  });
});

test('create from missing local resource throws RESOURCE_NOT_FOUND', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const target = join(base, 'target');
    const command = createCreateCommand();
    await assert.rejects(
      () => command.parseAsync(['node', 'test', '999', '--target', target]),
      (error) => error instanceof Error && 'code' in error && error.code === 'RESOURCE_NOT_FOUND',
    );
  });
});

test('create from a local doc resource throws CREATE_REQUIRES_TEMPLATE', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const target = join(base, 'target');
    const localRepo = new LocalResourceRepository();
    await localRepo.addDoc({ name: 'guide', uri: 'local://guide', content: 'hello' });

    const command = createCreateCommand();
    await assert.rejects(
      () => command.parseAsync(['node', 'test', '1', '--target', target]),
      (error) => error instanceof Error && 'code' in error && error.code === 'CREATE_REQUIRES_TEMPLATE',
    );
  });
});

test('--vars file with valid JSON object is applied', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const repo = join(base, 'repo');
    const target = join(base, 'target');
    const varsFile = join(base, 'vars.json');
    await createTemplateRepoWithMain(repo, { config: minimalYamlConfig, files: minimalTemplateFiles });
    await writeFile(varsFile, JSON.stringify({ projectName: 'fromfile' }), 'utf8');

    const command = createCreateCommand();
    const output = captureOutput();
    try {
      await command.parseAsync(['node', 'test', '--git-url', repo, '--target', target, '--vars', varsFile, '--json']);
    } finally {
      output.restore();
    }

    const parsed = JSON.parse(output.logs[0]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.variables.projectName, 'fromfile');
    assert.equal((await readFile(join(target, 'fromfile.txt'), 'utf8')).trim(), 'Hello fromfile');
  });
});

test('--vars file that does not exist throws TEMPLATE_VARS_FILE_INVALID', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const target = join(base, 'target');
    const command = createCreateCommand();
    await assert.rejects(
      () => command.parseAsync(['node', 'test', '--git-url', 'does-not-matter', '--target', target, '--vars', join(base, 'missing.json')]),
      (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_VARS_FILE_INVALID',
    );
  });
});

test('--vars file with invalid JSON throws TEMPLATE_VARS_FILE_INVALID', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const target = join(base, 'target');
    const varsFile = join(base, 'vars.json');
    await writeFile(varsFile, 'this is not json', 'utf8');

    const command = createCreateCommand();
    await assert.rejects(
      () => command.parseAsync(['node', 'test', '--git-url', 'does-not-matter', '--target', target, '--vars', varsFile]),
      (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_VARS_FILE_INVALID',
    );
  });
});

test('--vars file with non-object JSON throws TEMPLATE_VARS_FILE_INVALID', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const target = join(base, 'target');
    const varsFile = join(base, 'vars.json');
    await writeFile(varsFile, JSON.stringify([1, 2, 3]), 'utf8');

    const command = createCreateCommand();
    await assert.rejects(
      () => command.parseAsync(['node', 'test', '--git-url', 'does-not-matter', '--target', target, '--vars', varsFile]),
      (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_VARS_FILE_INVALID',
    );
  });
});

test('--var supports bool/null/number/string, multiple values, and overrides --vars', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const repo = join(base, 'repo');
    const target = join(base, 'target');
    const varsFile = join(base, 'vars.json');
    await createTemplateRepoWithMain(repo, { config: minimalYamlConfig, files: minimalTemplateFiles });
    await writeFile(varsFile, JSON.stringify({ projectName: 'file', count: 1, flag: false }), 'utf8');

    const command = createCreateCommand();
    const output = captureOutput();
    try {
      await command.parseAsync([
        'node', 'test', '--git-url', repo, '--target', target,
        '--vars', varsFile,
        '--var', 'projectName=override',
        '--var', 'flag=true',
        '--var', 'count=42',
        '--var', 'nothing=null',
        '--var', 'text=hello',
        '--json',
      ]);
    } finally {
      output.restore();
    }

    const parsed = JSON.parse(output.logs[0]);
    assert.equal(parsed.data.variables.projectName, 'override');
    assert.equal(parsed.data.variables.flag, true);
    assert.equal(parsed.data.variables.count, 42);
    assert.equal(parsed.data.variables.nothing, null);
    assert.equal(parsed.data.variables.text, 'hello');
    assert.equal((await readFile(join(target, 'override.txt'), 'utf8')).trim(), 'Hello override');
  });
});

test('--overwrite allows writing into a non-empty target directory', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const repo = join(base, 'repo');
    const target = join(base, 'target');
    await createTemplateRepoWithMain(repo, { config: minimalYamlConfig, files: minimalTemplateFiles });
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'existing.txt'), 'old', 'utf8');

    const command = createCreateCommand();
    await assert.rejects(
      () => command.parseAsync(['node', 'test', '--git-url', repo, '--target', target, '--var', 'projectName=app']),
      (error) => error instanceof Error && 'code' in error && error.code === 'TARGET_NOT_EMPTY',
    );

    const output = captureOutput();
    try {
      await command.parseAsync(['node', 'test', '--git-url', repo, '--target', target, '--var', 'projectName=app', '--overwrite', '--json']);
    } finally {
      output.restore();
    }

    const parsed = JSON.parse(output.logs[0]);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.data.filesWritten.includes('app.txt'));
    assert.equal((await readFile(join(target, 'existing.txt'), 'utf8')).trim(), 'old');
  });
});

test('--keep-git retains the .git directory', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const repo = join(base, 'repo');
    const target = join(base, 'target');
    await createTemplateRepoWithMain(repo, {
      config: 'version: "1.0"\n',
      files: [{ path: 'README.md', content: '# hello\n' }],
    });

    const command = createCreateCommand();
    await command.parseAsync(['node', 'test', '--git-url', repo, '--target', target, '--keep-git']);

    assert.ok(existsSync(join(target, '.git', 'HEAD')));
    assert.ok(existsSync(join(target, 'README.md')));
  });
});

test('--allow-hooks explicit true runs template hooks', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const repo = join(base, 'repo');
    const target = join(base, 'target');
    await createTemplateRepoWithMain(repo, {
      config: [
        'version: "1.0"',
        'hooks:',
        '  after_write:',
        '    scriptType: shell',
        '    script: node -e "require(\'fs\').writeFileSync(\'hook.txt\', \'ok\')"',
        '    errorHandling: stop',
        '',
      ].join('\n'),
      files: [{ path: 'README.md', content: '# hello\n' }],
    });

    const command = createCreateCommand();
    const output = captureOutput();
    try {
      await command.parseAsync(['node', 'test', '--git-url', repo, '--target', target, '--allow-hooks', '--json']);
    } finally {
      output.restore();
    }

    const parsed = JSON.parse(output.logs[0]);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.data.hooksExecuted, ['after_write']);
    assert.equal((await readFile(join(target, 'hook.txt'), 'utf8')).trim(), 'ok');
  });
});

test('--allow-hooks falls back to the configured default', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const repo = join(base, 'repo');
    const target = join(base, 'target');
    await createTemplateRepoWithMain(repo, {
      config: [
        'version: "1.0"',
        'hooks:',
        '  after_write:',
        '    scriptType: shell',
        '    script: node -e "require(\'fs\').writeFileSync(\'hook.txt\', \'default\')"',
        '    errorHandling: stop',
        '',
      ].join('\n'),
      files: [{ path: 'README.md', content: '# hello\n' }],
    });

    ConfigStore.save({ backend: { profile: 'auto' }, language: 'auto', template: { allowHooksDefault: true } });

    const command = createCreateCommand();
    const output = captureOutput();
    try {
      await command.parseAsync(['node', 'test', '--git-url', repo, '--target', target, '--json']);
    } finally {
      output.restore();
    }

    const parsed = JSON.parse(output.logs[0]);
    assert.deepEqual(parsed.data.hooksExecuted, ['after_write']);
    assert.equal((await readFile(join(target, 'hook.txt'), 'utf8')).trim(), 'default');
  });
});

test('--interactive conflicts with --json', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const target = join(base, 'target');
    const command = createCreateCommand();
    await assert.rejects(
      () => command.parseAsync(['node', 'test', '--git-url', 'does-not-matter', '--target', target, '--interactive', '--json']),
      (error) => error instanceof Error && 'code' in error && error.code === 'INTERACTIVE_JSON_CONFLICT',
    );
  });
});

test('--interactive requires a TTY', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-create-interactive-'));
  const dataDir = join(dir, 'data');
  const target = join(dir, 'target');
  await mkdir(dataDir, { recursive: true });
  try {
    const result = await runCli(
      ['create', '--git-url', 'does-not-matter', '--target', target, '--interactive'],
      dataDir,
      { env: { AGILEBUILDER_LANG: 'en-US' } },
    );
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /requires an interactive terminal/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--subdir that escapes the repository is rejected', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const repo = join(base, 'repo');
    const target = join(base, 'target');
    await createTemplateRepoWithMain(repo, {
      config: 'version: "1.0"\n',
      files: [{ path: 'README.md', content: '# hello\n' }],
    });

    const command = createCreateCommand();
    await assert.rejects(
      () => command.parseAsync(['node', 'test', '--git-url', repo, '--target', target, '--subdir', '../']),
      (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_SUBDIR_UNSAFE',
    );
  });
});

test('--subdir with an absolute path is rejected', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const repo = join(base, 'repo');
    const target = join(base, 'target');
    await createTemplateRepoWithMain(repo, {
      config: 'version: "1.0"\n',
      files: [{ path: 'README.md', content: '# hello\n' }],
    });

    const command = createCreateCommand();
    await assert.rejects(
      () => command.parseAsync(['node', 'test', '--git-url', repo, '--target', target, '--subdir', '/etc']),
      (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_SUBDIR_UNSAFE',
    );
  });
});

test('--target pointing to a system root is rejected', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const target = unsafeRoot();
    const command = createCreateCommand();
    await assert.rejects(
      () => command.parseAsync(['node', 'test', '--git-url', 'does-not-matter', '--target', target]),
      (error) => error instanceof Error && 'code' in error && error.code === 'UNSAFE_TARGET_DIR',
    );
  });
});

test('--target that is not a directory is rejected', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const targetFile = join(base, 'target-file');
    await writeFile(targetFile, 'not a directory', 'utf8');

    const command = createCreateCommand();
    await assert.rejects(
      () => command.parseAsync(['node', 'test', '--git-url', 'does-not-matter', '--target', targetFile]),
      (error) => error instanceof Error && 'code' in error && error.code === 'TARGET_NOT_WRITABLE',
    );
  });
});

test('create from a cloud resource succeeds and records access', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const base = dirname(dataDir);
    const repo = join(base, 'repo');
    const target = join(base, 'target');
    await createTemplateRepoWithMain(repo, {
      files: [{ path: '{{ projectName }}.txt', content: 'Hello <%= projectName %>\n' }],
    });

    WorkspaceStore.setCurrent('space-1');

    let accessedSpaceId: string | undefined;
    let accessedResourceId: string | undefined;
    TokenStore.getValidToken = async () => 'token';
    ClientApi.getResourceDetail = async (_token, spaceId, resourceId) => {
      assert.equal(spaceId, 'space-1');
      assert.equal(resourceId, 'cloud-tpl-1');
      return cloudTemplateResource('cloud-tpl-1', 'space-1', repo);
    };
    ClientApi.recordResourceAccess = async (_token, spaceId, resourceId) => {
      accessedSpaceId = spaceId;
      accessedResourceId = resourceId;
      return undefined;
    };

    const command = createCreateCommand();
    const output = captureOutput();
    try {
      await command.parseAsync(['node', 'test', 'cloud-tpl-1', '--target', target, '--var', 'projectName=cloudapp', '--json']);
    } finally {
      output.restore();
    }

    const parsed = JSON.parse(output.logs[0]);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.data.filesWritten.includes('cloudapp.txt'));
    assert.equal((await readFile(join(target, 'cloudapp.txt'), 'utf8')).trim(), 'Hello cloudapp');
    assert.equal(accessedSpaceId, 'space-1');
    assert.equal(accessedResourceId, 'cloud-tpl-1');
  });
});

test('CLI smoke: create from a local resource id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-create-cli-'));
  const dataDir = join(dir, 'data');
  const repo = join(dir, 'repo');
  const target = join(dir, 'target');
  await mkdir(dataDir, { recursive: true });
  try {
    await createTemplateRepoWithMain(repo, { config: minimalYamlConfig, files: minimalTemplateFiles });

    const add = await runCli(['res', 'add', 'template', '--name', 'cli-demo', '--git-url', repo, '--branch', 'main', '--json'], dataDir);
    assert.equal(add.exitCode, 0, add.stderr);

    const text = await runCli(
      ['create', '1', '--target', join(target, 'text'), '--var', 'projectName=cli-text'],
      dataDir,
      { env: { AGILEBUILDER_LANG: 'en-US' } },
    );
    assert.equal(text.exitCode, 0, text.stderr);
    assert.match(text.stdout, /Project created successfully/);

    const json = await runCli(['create', '1', '--target', join(target, 'json'), '--var', 'projectName=cli-json', '--json'], dataDir);
    assert.equal(json.exitCode, 0, json.stderr);
    const parsed = JSON.parse(json.stdout);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.data.filesWritten.includes('cli-json.txt'));
    assert.equal((await readFile(join(target, 'json', 'cli-json.txt'), 'utf8')).trim(), 'Hello cli-json');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI smoke: create from --git-url with JSON output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-create-git-cli-'));
  const dataDir = join(dir, 'data');
  const repo = join(dir, 'repo');
  const target = join(dir, 'target');
  await mkdir(dataDir, { recursive: true });
  try {
    await createTemplateRepoWithMain(repo, { config: minimalYamlConfig, files: minimalTemplateFiles });

    const result = await runCli(['create', '--git-url', repo, '--target', target, '--var', 'projectName=gitapp', '--json'], dataDir);
    assert.equal(result.exitCode, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal((await readFile(join(target, 'gitapp.txt'), 'utf8')).trim(), 'Hello gitapp');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI: missing source renders CREATE_SOURCE_REQUIRED as JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-create-no-source-'));
  const dataDir = join(dir, 'data');
  const target = join(dir, 'target');
  await mkdir(dataDir, { recursive: true });
  try {
    const result = await runCli(['create', '--target', target, '--json'], dataDir);
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /"ok":\s*false/);
    assert.match(result.stderr, /"code":\s*"CREATE_SOURCE_REQUIRED"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI: invalid --vars file renders TEMPLATE_VARS_FILE_INVALID as JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-create-vars-'));
  const dataDir = join(dir, 'data');
  const target = join(dir, 'target');
  await mkdir(dataDir, { recursive: true });
  try {
    const result = await runCli(['create', '--git-url', 'does-not-matter', '--target', target, '--vars', join(dir, 'missing.json'), '--json'], dataDir);
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /"ok":\s*false/);
    assert.match(result.stderr, /"code":\s*"TEMPLATE_VARS_FILE_INVALID"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI: unsafe target renders UNSAFE_TARGET_DIR as JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-create-unsafe-'));
  const dataDir = join(dir, 'data');
  await mkdir(dataDir, { recursive: true });
  try {
    const result = await runCli(['create', '--git-url', 'does-not-matter', '--target', unsafeRoot(), '--json'], dataDir);
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /"ok":\s*false/);
    assert.match(result.stderr, /"code":\s*"UNSAFE_TARGET_DIR"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI: non-empty target without --overwrite renders TARGET_NOT_EMPTY as JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-create-nonempty-'));
  const dataDir = join(dir, 'data');
  const repo = join(dir, 'repo');
  const target = join(dir, 'target');
  await mkdir(dataDir, { recursive: true });
  try {
    await createTemplateRepoWithMain(repo, { config: minimalYamlConfig, files: minimalTemplateFiles });
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'existing.txt'), 'old', 'utf8');

    const result = await runCli(['create', '--git-url', repo, '--target', target, '--var', 'projectName=app', '--json'], dataDir);
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /"ok":\s*false/);
    assert.match(result.stderr, /"code":\s*"TARGET_NOT_EMPTY"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
