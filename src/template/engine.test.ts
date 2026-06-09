import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import test from 'node:test';
import { TemplateEngine } from './engine.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

test('TemplateEngine generates from a git repository with AgileBuilder config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-template-'));
  const repo = join(dir, 'repo');
  const target = join(dir, 'target');
  try {
    await git(dir, ['init', 'repo']);
    await writeFile(join(repo, '.agilebuilder.config.yaml'), [
      'version: 1',
      'variables:',
      '  enabled: true',
      '  filePatterns:',
      '    mode: include',
      '    patterns:',
      '      - "**/*.txt"',
      '  inquirerQuestions:',
      '    - name: projectName',
      '      type: input',
      '      message: Project name',
      '      required: true',
      '',
    ].join('\n'), 'utf8');
    await writeFile(join(repo, '{{ projectName }}.txt'), 'Hello <%= projectName %>\n', 'utf8');
    await writeFile(join(repo, 'raw.bin'), Buffer.from([0, 1, 2, 3]));
    await git(repo, ['add', '.']);
    await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      variables: { projectName: 'demo-app' },
    });

    assert.equal(result.success, true);
    assert.equal(result.configFile, '.agilebuilder.config.yaml');
    assert.match(await readFile(join(target, 'demo-app.txt'), 'utf8'), /Hello demo-app/);
    assert.deepEqual(await readFile(join(target, 'raw.bin')), Buffer.from([0, 1, 2, 3]));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine skips hooks by default and runs them when allowed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-hooks-'));
  const repo = join(dir, 'repo');
  const skippedTarget = join(dir, 'target-skipped');
  const allowedTarget = join(dir, 'target-allowed');
  try {
    await git(dir, ['init', 'repo']);
    await writeFile(join(repo, '.agilebuilder.config.yaml'), [
      'version: 1',
      'hooks:',
      '  after_write:',
      '    scriptType: shell',
      '    script: node -e "require(\'fs\').writeFileSync(\'hook.txt\', \'ok\')"',
      '    errorHandling: stop',
      '',
    ].join('\n'), 'utf8');
    await writeFile(join(repo, 'README.md'), 'hello\n', 'utf8');
    await git(repo, ['add', '.']);
    await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);

    const skipped = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: skippedTarget,
    });
    assert.deepEqual(skipped.hooksSkipped, ['after_write']);
    assert.equal(existsSync(join(skippedTarget, 'hook.txt')), false);

    const allowed = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: allowedTarget,
      allowHooks: true,
    });
    assert.deepEqual(allowed.hooksExecuted, ['after_write']);
    assert.equal(await readFile(join(allowedTarget, 'hook.txt'), 'utf8'), 'ok');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine warns and continues when no AgileBuilder config exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-no-config-'));
  const repo = join(dir, 'repo');
  const target = join(dir, 'target');
  try {
    await git(dir, ['init', 'repo']);
    await writeFile(join(repo, 'README.md'), 'hello\n', 'utf8');
    await git(repo, ['add', '.']);
    await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
    });

    assert.equal(result.configFile, undefined);
    assert.deepEqual(result.warnings, ['No AgileBuilder template config file found; continuing with default config.']);
    assert.equal((await readFile(join(target, 'README.md'), 'utf8')).replace(/\r\n/g, '\n'), 'hello\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine prefers YAML config over JSON config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-config-priority-'));
  const repo = join(dir, 'repo');
  const target = join(dir, 'target');
  try {
    await git(dir, ['init', 'repo']);
    await writeFile(join(repo, '.agilebuilder.config.json'), JSON.stringify({
      version: 1,
      variables: {
        enabled: true,
        filePatterns: { mode: 'include', patterns: ['**/*.txt'] },
        inquirerQuestions: [
          { name: 'projectName', type: 'input', message: 'Project name', default: 'json-name' },
        ],
      },
      hooks: {},
    }), 'utf8');
    await writeFile(join(repo, '.agilebuilder.config.yaml'), [
      'version: 1',
      'variables:',
      '  enabled: true',
      '  filePatterns:',
      '    mode: include',
      '    patterns:',
      '      - "**/*.txt"',
      '  inquirerQuestions:',
      '    - name: projectName',
      '      type: input',
      '      message: Project name',
      '      default: yaml-name',
      '',
    ].join('\n'), 'utf8');
    await writeFile(join(repo, '{{ projectName }}.txt'), 'Hello <%= projectName %>\n', 'utf8');
    await git(repo, ['add', '.']);
    await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
    });

    assert.equal(result.configFile, '.agilebuilder.config.yaml');
    assert.equal((await readFile(join(target, 'yaml-name.txt'), 'utf8')).replace(/\r\n/g, '\n'), 'Hello yaml-name\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine uses source.subdir as the template file root', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-source-subdir-'));
  const repo = join(dir, 'repo');
  const target = join(dir, 'target');
  try {
    await git(dir, ['init', 'repo']);
    await writeFile(join(repo, '.agilebuilder.config.yaml'), [
      'version: 1',
      'source:',
      '  subdir: template',
      'variables:',
      '  enabled: true',
      '  filePatterns:',
      '    mode: include',
      '    patterns:',
      '      - "**/*.md"',
      '  inquirerQuestions:',
      '    - name: projectName',
      '      type: input',
      '      message: Project name',
      '      required: true',
      '',
    ].join('\n'), 'utf8');
    await writeFile(join(repo, 'ROOT_ONLY.md'), 'should not copy\n', 'utf8');
    await mkdir(join(repo, 'template'), { recursive: true });
    await writeFile(join(repo, 'template', '{{ projectName }}.md'), '# <%= projectName %>\n', 'utf8');
    await git(repo, ['add', '.']);
    await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      variables: { projectName: 'demo-app' },
    });

    assert.equal(result.configFile, '.agilebuilder.config.yaml');
    assert.equal(existsSync(join(target, 'ROOT_ONLY.md')), false);
    assert.equal((await readFile(join(target, 'demo-app.md'), 'utf8')).replace(/\r\n/g, '\n'), '# demo-app\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine can use a workspace-provided template config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-workspace-config-'));
  const repo = join(dir, 'repo');
  const target = join(dir, 'target');
  try {
    await git(dir, ['init', 'repo']);
    await writeFile(join(repo, '{{ projectName }}.txt'), 'Hello <%= projectName %>\n', 'utf8');
    await git(repo, ['add', '.']);
    await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      variables: { projectName: 'from-workspace' },
      templateConfig: {
        version: 1,
        variables: {
          enabled: true,
          filePatterns: {
            mode: 'include',
            patterns: ['**/*.txt'],
          },
          delimiter: '%',
          inquirerQuestions: [
            {
              name: 'projectName',
              type: 'input',
              message: 'Project name',
              required: true,
            },
          ],
        },
        hooks: {},
      },
    });

    assert.deepEqual(result.warnings, []);
    assert.equal((await readFile(join(target, 'from-workspace.txt'), 'utf8')).replace(/\r\n/g, '\n'), 'Hello from-workspace\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
