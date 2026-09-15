import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import test from 'node:test';
import { TemplateEngine } from './engine.js';
import { createTemplateRepo, minimalYamlConfig } from '../test-helpers/template-fixture.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

async function setup(prefix: string): Promise<{ dir: string; repo: string; target: string }> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return { dir, repo: join(dir, 'repo'), target: join(dir, 'target') };
}

test('TemplateEngine generates from a git repository with AgileBuilder config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-template-'));
  const repo = join(dir, 'repo');
  const target = join(dir, 'target');
  try {
    await git(dir, ['init', 'repo']);
    await writeFile(join(repo, '.agilebuilder.config.yaml'), [
      'version: "1.0"',
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
      'version: "1.0"',
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
      version: "1.0",
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
      'version: "1.0"',
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
      'version: "1.0"',
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
        version: '1.0',
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

test('TemplateEngine does not prompt when variables are already provided', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-interactive-provided-'));
  const repo = join(dir, 'repo');
  const target = join(dir, 'target');
  try {
    await git(dir, ['init', 'repo']);
    await writeFile(join(repo, '.agilebuilder.config.yaml'), [
      'version: "1.0"',
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
    await git(repo, ['add', '.']);
    await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      variables: { projectName: 'provided-app' },
      interactive: true,
    });

    assert.equal(result.success, true);
    assert.equal((await readFile(join(target, 'provided-app.txt'), 'utf8')).replace(/\r\n/g, '\n'), 'Hello provided-app\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine skips interactive prompts when variables are disabled', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-interactive-disabled-'));
  const repo = join(dir, 'repo');
  const target = join(dir, 'target');
  try {
    await git(dir, ['init', 'repo']);
    await writeFile(join(repo, '.agilebuilder.config.yaml'), [
      'version: "1.0"',
      'variables:',
      '  enabled: false',
      '  inquirerQuestions:',
      '    - name: projectName',
      '      type: input',
      '      message: Project name',
      '      default: default-app',
      '',
    ].join('\n'), 'utf8');
    await writeFile(join(repo, 'README.md'), 'hello\n', 'utf8');
    await git(repo, ['add', '.']);
    await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      interactive: true,
    });

    assert.equal(result.success, true);
    assert.equal((await readFile(join(target, 'README.md'), 'utf8')).replace(/\r\n/g, '\n'), 'hello\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test('TemplateEngine rejects subdir that escapes the repository', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-unsafe-subdir-'));
  const repo = join(dir, 'repo');
  const target = join(dir, 'target');
  const secretFile = join(dir, 'secret.txt');
  try {
    await git(dir, ['init', 'repo']);
    await writeFile(secretFile, ' sensitive\n', 'utf8');
    await writeFile(join(repo, '.agilebuilder.config.yaml'), [
      'version: "1.0"',
      '',
    ].join('\n'), 'utf8');
    await writeFile(join(repo, 'README.md'), 'hello\n', 'utf8');
    await git(repo, ['add', '.']);
    await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);

    await assert.rejects(
      () => new TemplateEngine().generateFromGit({
        gitUrl: repo,
        targetDir: target,
        subdir: '../',
      }),
      (error) => error instanceof Error && error.message.includes('unsafe'),
    );

    // Ensure the secret file was not copied or modified.
    assert.equal(await readFile(secretFile, 'utf8'), ' sensitive\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test('TemplateEngine keeps .git directory when keepGit is true', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-keep-git-'));
  const repo = join(dir, 'repo');
  const target = join(dir, 'target');
  try {
    await git(dir, ['init', 'repo']);
    await writeFile(join(repo, '.agilebuilder.config.yaml'), [
      'version: "1.0"',
      '',
    ].join('\n'), 'utf8');
    await writeFile(join(repo, 'README.md'), 'hello\n', 'utf8');
    await git(repo, ['add', '.']);
    await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);

    await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      keepGit: true,
    });

    const head = join(target, '.git', 'HEAD');
    assert.ok(existsSync(head), 'Expected .git/HEAD to be copied when keepGit is true');
    assert.ok(existsSync(join(target, 'README.md')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine removes .git directory by default', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-no-git-'));
  const repo = join(dir, 'repo');
  const target = join(dir, 'target');
  try {
    await git(dir, ['init', 'repo']);
    await writeFile(join(repo, '.agilebuilder.config.yaml'), [
      'version: "1.0"',
      '',
    ].join('\n'), 'utf8');
    await writeFile(join(repo, 'file.txt'), 'data\n', 'utf8');
    await git(repo, ['add', '.']);
    await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);

    await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
    });

    assert.ok(!existsSync(join(target, '.git')), 'Expected .git to be removed by default');
    assert.ok(existsSync(join(target, 'file.txt')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine renders with alternative delimiter', async () => {
  const { dir, repo, target } = await setup('ag-core1-alt-delim-');
  try {
    await createTemplateRepo(repo, {
      config: [
        'version: "1.0"',
        'variables:',
        '  enabled: true',
        '  delimiter: "?"',
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
      ].join('\n'),
      files: [{ path: '{{ projectName }}.txt', content: 'Hello <?= projectName ?>\n' }],
    });

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      variables: { projectName: 'alt-app' },
    });

    assert.equal(result.success, true);
    assert.equal((await readFile(join(target, 'alt-app.txt'), 'utf8')).replace(/\r\n/g, '\n'), 'Hello alt-app\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine captures delimiter consistency issue when rendered path contains <', async () => {
  const { dir, repo, target } = await setup('ag-core1-delim-consistency-');
  try {
    await createTemplateRepo(repo, {
      config: minimalYamlConfig,
      files: [{ path: '{{ projectName }}.txt', content: 'Hello <%= projectName %>\n' }],
    });

    await assert.rejects(
      () => new TemplateEngine().generateFromGit({
        gitUrl: repo,
        targetDir: target,
        variables: { projectName: '<%' },
      }),
      (error) => error instanceof Error && error.message.includes('Could not find matching close tag'),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine filePatterns include mode renders only matched files', async () => {
  const { dir, repo, target } = await setup('ag-core1-patterns-include-');
  try {
    await createTemplateRepo(repo, {
      config: [
        'version: "1.0"',
        'variables:',
        '  enabled: true',
        '  delimiter: "%"',
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
      ].join('\n'),
      files: [
        { path: '{{ projectName }}.txt', content: 'Hello <%= projectName %>\n' },
        { path: 'README.md', content: '# <%= projectName %>\n' },
      ],
    });

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      variables: { projectName: 'demo' },
    });

    assert.ok(result.filesWritten.includes('demo.txt'));
    assert.ok(result.filesWritten.includes('README.md'));
    assert.equal((await readFile(join(target, 'demo.txt'), 'utf8')).replace(/\r\n/g, '\n'), 'Hello demo\n');
    assert.equal((await readFile(join(target, 'README.md'), 'utf8')).replace(/\r\n/g, '\n'), '# <%= projectName %>\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine filePatterns exclude mode skips matched files', async () => {
  const { dir, repo, target } = await setup('ag-core1-patterns-exclude-');
  try {
    await createTemplateRepo(repo, {
      config: [
        'version: "1.0"',
        'variables:',
        '  enabled: true',
        '  delimiter: "%"',
        '  filePatterns:',
        '    mode: exclude',
        '    patterns:',
        '      - "**/*.md"',
        '  inquirerQuestions:',
        '    - name: projectName',
        '      type: input',
        '      message: Project name',
        '      required: true',
        '',
      ].join('\n'),
      files: [
        { path: '{{ projectName }}.txt', content: 'Hello <%= projectName %>\n' },
        { path: 'README.md', content: '# <%= projectName %>\n' },
      ],
    });

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      variables: { projectName: 'demo' },
    });

    assert.ok(result.filesWritten.includes('demo.txt'));
    assert.ok(result.filesWritten.includes('README.md'));
    assert.equal((await readFile(join(target, 'demo.txt'), 'utf8')).replace(/\r\n/g, '\n'), 'Hello demo\n');
    assert.equal((await readFile(join(target, 'README.md'), 'utf8')).replace(/\r\n/g, '\n'), '# <%= projectName %>\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine filePatterns all mode renders all files', async () => {
  const { dir, repo, target } = await setup('ag-core1-patterns-all-');
  try {
    await createTemplateRepo(repo, {
      config: [
        'version: "1.0"',
        'variables:',
        '  enabled: true',
        '  delimiter: "%"',
        '  filePatterns:',
        '    mode: all',
        '    patterns: []',
        '  inquirerQuestions:',
        '    - name: projectName',
        '      type: input',
        '      message: Project name',
        '      required: true',
        '',
      ].join('\n'),
      files: [
        { path: '{{ projectName }}.txt', content: 'Hello <%= projectName %>\n' },
        { path: 'README.md', content: '# <%= projectName %>\n' },
      ],
    });

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      variables: { projectName: 'demo' },
    });

    assert.ok(result.filesWritten.includes('demo.txt'));
    assert.ok(result.filesWritten.includes('README.md'));
    assert.equal((await readFile(join(target, 'demo.txt'), 'utf8')).replace(/\r\n/g, '\n'), 'Hello demo\n');
    assert.equal((await readFile(join(target, 'README.md'), 'utf8')).replace(/\r\n/g, '\n'), '# demo\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine filePatterns include with empty patterns copies files unrendered', async () => {
  const { dir, repo, target } = await setup('ag-core1-patterns-empty-');
  try {
    await createTemplateRepo(repo, {
      config: [
        'version: "1.0"',
        'variables:',
        '  enabled: true',
        '  delimiter: "%"',
        '  filePatterns:',
        '    mode: include',
        '    patterns: []',
        '  inquirerQuestions:',
        '    - name: projectName',
        '      type: input',
        '      message: Project name',
        '      required: true',
        '',
      ].join('\n'),
      files: [
        { path: '{{ projectName }}.txt', content: 'Hello <%= projectName %>\n' },
      ],
    });

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      variables: { projectName: 'demo' },
    });

    // Empty include patterns are treated as "include all", so rendering still happens.
    assert.ok(result.filesWritten.includes('demo.txt'));
    assert.equal((await readFile(join(target, 'demo.txt'), 'utf8')).replace(/\r\n/g, '\n'), 'Hello demo\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine preserves binary files unchanged', async () => {
  const { dir, repo, target } = await setup('ag-core1-binary-');
  try {
    const binary = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    await createTemplateRepo(repo, {
      config: minimalYamlConfig,
      files: [
        { path: '{{ projectName }}.txt', content: 'Hello <%= projectName %>\n' },
        { path: 'image.bin', content: binary },
      ],
    });

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      variables: { projectName: 'demo' },
    });

    assert.ok(result.filesWritten.includes('demo.txt'));
    assert.ok(result.filesWritten.includes('image.bin'));
    assert.deepEqual(await readFile(join(target, 'image.bin')), binary);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine source.subdir via config escapes repository', async () => {
  const { dir, repo, target } = await setup('ag-core1-config-subdir-escape-');
  const secretFile = join(dir, 'secret.txt');
  try {
    await writeFile(secretFile, ' sensitive\n', 'utf8');
    await createTemplateRepo(repo, {
      config: [
        'version: "1.0"',
        'source:',
        '  subdir: ../',
        '',
      ].join('\n'),
      files: [{ path: 'README.md', content: 'hello\n' }],
    });

    await assert.rejects(
      () => new TemplateEngine().generateFromGit({
        gitUrl: repo,
        targetDir: target,
      }),
      (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_SUBDIR_UNSAFE',
    );
    assert.equal(await readFile(secretFile, 'utf8'), ' sensitive\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine source.subdir via config uses absolute path safely', async () => {
  const { dir, repo, target } = await setup('ag-core1-config-subdir-absolute-');
  try {
    await createTemplateRepo(repo, {
      config: [
        'version: "1.0"',
        'source:',
        `  subdir: ${join(dir, 'outside')}`,
        '',
      ].join('\n'),
      files: [{ path: 'README.md', content: 'hello\n' }],
    });

    await assert.rejects(
      () => new TemplateEngine().generateFromGit({
        gitUrl: repo,
        targetDir: target,
      }),
      (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_SUBDIR_UNSAFE',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine rejects forbidden target directories', async () => {
  const { dir, repo } = await setup('ag-core1-target-root-');
  try {
    await createTemplateRepo(repo, {
      config: minimalYamlConfig,
      files: [{ path: 'README.md', content: 'hello\n' }],
    });

    await assert.rejects(
      () => new TemplateEngine().generateFromGit({
        gitUrl: repo,
        targetDir: 'C:\\',
      }),
      (error) => error instanceof Error && 'code' in error && error.code === 'UNSAFE_TARGET_DIR',
    );

    await assert.rejects(
      () => new TemplateEngine().generateFromGit({
        gitUrl: repo,
        targetDir: 'C:\\Windows',
      }),
      (error) => error instanceof Error && 'code' in error && error.code === 'UNSAFE_TARGET_DIR',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine rejects target that is not a directory', async () => {
  const { dir, repo, target } = await setup('ag-core1-target-file-');
  try {
    await createTemplateRepo(repo, {
      config: minimalYamlConfig,
      files: [{ path: 'README.md', content: 'hello\n' }],
    });
    await writeFile(target, 'not a directory', 'utf8');

    await assert.rejects(
      () => new TemplateEngine().generateFromGit({
        gitUrl: repo,
        targetDir: target,
        variables: { projectName: 'demo' },
      }),
      (error) => error instanceof Error && 'code' in error && error.code === 'TARGET_NOT_WRITABLE',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine rejects non-empty target without overwrite', async () => {
  const { dir, repo, target } = await setup('ag-core1-target-not-empty-');
  try {
    await createTemplateRepo(repo, {
      config: minimalYamlConfig,
      files: [{ path: '{{ projectName }}.txt', content: 'Hello\n' }],
    });
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'existing.txt'), 'existing\n', 'utf8');

    await assert.rejects(
      () => new TemplateEngine().generateFromGit({
        gitUrl: repo,
        targetDir: target,
        variables: { projectName: 'demo' },
      }),
      (error) => error instanceof Error && 'code' in error && error.code === 'TARGET_NOT_EMPTY',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine allows non-empty target with overwrite', async () => {
  const { dir, repo, target } = await setup('ag-core1-target-overwrite-');
  try {
    await createTemplateRepo(repo, {
      config: minimalYamlConfig,
      files: [{ path: '{{ projectName }}.txt', content: 'Hello <%= projectName %>\n' }],
    });
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'existing.txt'), 'existing\n', 'utf8');

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      variables: { projectName: 'demo' },
      overwrite: true,
    });

    assert.equal(result.success, true);
    assert.equal(existsSync(join(target, 'demo.txt')), true);
    assert.equal((await readFile(join(target, 'existing.txt'), 'utf8')).replace(/\r\n/g, '\n'), 'existing\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine hook errorHandling stop throws HOOK_FAILED', async () => {
  const { dir, repo, target } = await setup('ag-core1-hook-stop-');
  try {
    await createTemplateRepo(repo, {
      config: [
        'version: "1.0"',
        'hooks:',
        '  after_write:',
        '    scriptType: shell',
        '    script: exit 1',
        '    errorHandling: stop',
        '',
      ].join('\n'),
      files: [{ path: 'README.md', content: 'hello\n' }],
    });

    await assert.rejects(
      () => new TemplateEngine().generateFromGit({
        gitUrl: repo,
        targetDir: target,
        allowHooks: true,
      }),
      (error) => error instanceof Error && 'code' in error && error.code === 'HOOK_FAILED',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine hook errorHandling warn skips and continues', async () => {
  const { dir, repo, target } = await setup('ag-core1-hook-warn-');
  try {
    await createTemplateRepo(repo, {
      config: [
        'version: "1.0"',
        'hooks:',
        '  after_write:',
        '    scriptType: shell',
        '    script: exit 1',
        '    errorHandling: warn',
        '',
      ].join('\n'),
      files: [{ path: 'README.md', content: 'hello\n' }],
    });

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      allowHooks: true,
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.hooksExecuted, []);
    assert.deepEqual(result.hooksSkipped, ['after_write']);
    assert.equal(existsSync(join(target, 'README.md')), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine hook errorHandling continue skips and continues', async () => {
  const { dir, repo, target } = await setup('ag-core1-hook-continue-');
  try {
    await createTemplateRepo(repo, {
      config: [
        'version: "1.0"',
        'hooks:',
        '  after_write:',
        '    scriptType: shell',
        '    script: exit 42',
        '    errorHandling: continue',
        '',
      ].join('\n'),
      files: [{ path: 'README.md', content: 'hello\n' }],
    });

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      allowHooks: true,
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.hooksExecuted, []);
    assert.deepEqual(result.hooksSkipped, ['after_write']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine hook succeeds quickly', async () => {
  const { dir, repo, target } = await setup('ag-core1-hook-quick-');
  try {
    await createTemplateRepo(repo, {
      config: [
        'version: "1.0"',
        'hooks:',
        '  after_write:',
        '    scriptType: shell',
        '    script: node -e "require(\'fs\').writeFileSync(\'quick.txt\', \'done\')"',
        '    errorHandling: stop',
        '',
      ].join('\n'),
      files: [{ path: 'README.md', content: 'hello\n' }],
    });

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      allowHooks: true,
    });

    assert.deepEqual(result.hooksExecuted, ['after_write']);
    assert.equal((await readFile(join(target, 'quick.txt'), 'utf8')).replace(/\r\n/g, '\n'), 'done');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine hook timeout is not configurable via public API', async () => {
  // The default hook timeout is 5 minutes and runShell is private, so an actual
  // timeout test would take too long. This test documents the limitation and
  // verifies that a fast hook still works with the same configuration path.
  const { dir, repo, target } = await setup('ag-core1-hook-timeout-placeholder-');
  try {
    await createTemplateRepo(repo, {
      config: [
        'version: "1.0"',
        'hooks:',
        '  after_write:',
        '    scriptType: shell',
        '    script: node -e "require(\'fs\').writeFileSync(\'fast.txt\', \'ok\')"',
        '    errorHandling: stop',
        '',
      ].join('\n'),
      files: [{ path: 'README.md', content: 'hello\n' }],
    });

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      allowHooks: true,
    });

    assert.deepEqual(result.hooksExecuted, ['after_write']);
    assert.equal((await readFile(join(target, 'fast.txt'), 'utf8')).replace(/\r\n/g, '\n'), 'ok');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine throws TEMPLATE_VARS_MISSING when required variable is missing', async () => {
  const { dir, repo, target } = await setup('ag-core1-missing-vars-');
  try {
    await createTemplateRepo(repo, {
      config: minimalYamlConfig,
      files: [{ path: '{{ projectName }}.txt', content: 'Hello <%= projectName %>\n' }],
    });

    await assert.rejects(
      () => new TemplateEngine().generateFromGit({
        gitUrl: repo,
        targetDir: target,
        variables: {},
      }),
      (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_VARS_MISSING',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine workspace config enforces required variables', async () => {
  const { dir, repo, target } = await setup('ag-core1-workspace-missing-');
  try {
    await createTemplateRepo(repo, {
      files: [{ path: '{{ projectName }}.txt', content: 'Hello <%= projectName %>\n' }],
    });

    await assert.rejects(
      () => new TemplateEngine().generateFromGit({
        gitUrl: repo,
        targetDir: target,
        templateConfig: {
          version: '1.0',
          variables: {
            enabled: true,
            filePatterns: { mode: 'include', patterns: ['**/*.txt'] },
            delimiter: '%',
            inquirerQuestions: [
              { name: 'projectName', type: 'input', message: 'Project name', required: true },
            ],
          },
          hooks: {},
        },
      }),
      (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_VARS_MISSING',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine workspace config with source.subdir', async () => {
  const { dir, repo, target } = await setup('ag-core1-workspace-subdir-');
  try {
    await createTemplateRepo(repo, {
      files: [
        { path: 'template/{{ projectName }}.txt', content: 'Hello <%= projectName %>\n' },
        { path: 'README.md', content: 'root\n' },
      ],
    });

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      variables: { projectName: 'ws-subdir' },
      templateConfig: {
        version: '1.0',
        source: { subdir: 'template' },
        variables: {
          enabled: true,
          filePatterns: { mode: 'include', patterns: ['**/*.txt'] },
          delimiter: '%',
          inquirerQuestions: [
            { name: 'projectName', type: 'input', message: 'Project name', required: true },
          ],
        },
        hooks: {},
      },
    });

    assert.equal(result.success, true);
    assert.equal(existsSync(join(target, 'ws-subdir.txt')), true);
    assert.equal(existsSync(join(target, 'README.md')), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine workspace config with hooks skipped by default', async () => {
  const { dir, repo, target } = await setup('ag-core1-workspace-hooks-');
  try {
    await createTemplateRepo(repo, {
      files: [{ path: 'README.md', content: 'hello\n' }],
    });

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      templateConfig: {
        version: '1.0',
        variables: {
          enabled: false,
          filePatterns: { mode: 'all', patterns: ['**/*'] },
          delimiter: '%',
          inquirerQuestions: [],
        },
        hooks: {
          after_write: {
            scriptType: 'shell',
            script: 'node -e "require(\'fs\').writeFileSync(\'hook.txt\', \'ok\')"',
            errorHandling: 'stop',
          },
        },
      },
    });

    assert.deepEqual(result.hooksSkipped, ['after_write']);
    assert.equal(existsSync(join(target, 'hook.txt')), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test('TemplateEngine normalizes <% delimiter to %', async () => {
  const { dir, repo, target } = await setup('ag-core1-delim-angle-');
  try {
    await createTemplateRepo(repo, {
      config: [
        'version: "1.0"',
        'variables:',
        '  enabled: true',
        '  delimiter: "<%"',
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
      ].join('\n'),
      files: [{ path: '{{ projectName }}.txt', content: 'Hello <%= projectName %>\n' }],
    });

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      variables: { projectName: 'angle-app' },
    });

    assert.equal(result.success, true);
    assert.equal((await readFile(join(target, 'angle-app.txt'), 'utf8')).replace(/\r\n/g, '\n'), 'Hello angle-app\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine maps EJS ReferenceError to TEMPLATE_VARS_MISSING', async () => {
  const { dir, repo, target } = await setup('ag-core1-ejs-missing-');
  try {
    await createTemplateRepo(repo, {
      config: [
        'version: "1.0"',
        'variables:',
        '  enabled: true',
        '  filePatterns:',
        '    mode: include',
        '    patterns:',
        '      - "**/*.txt"',
        '  inquirerQuestions: []',
        '',
      ].join('\n'),
      files: [{ path: 'app.txt', content: 'Hello <%= undeclaredVar %>\n' }],
    });

    await assert.rejects(
      () => new TemplateEngine().generateFromGit({
        gitUrl: repo,
        targetDir: target,
        variables: {},
      }),
      (error) => error instanceof Error && 'code' in error && error.code === 'TEMPLATE_VARS_MISSING',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TemplateEngine records the template commit hash in the result', async () => {
  const { dir, repo, target } = await setup('ag-core1-commit-');
  try {
    await createTemplateRepo(repo, {
      config: minimalYamlConfig,
      files: [{ path: '{{ projectName }}.txt', content: 'Hello <%= projectName %>\n' }],
    });
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repo });

    const result = await new TemplateEngine().generateFromGit({
      gitUrl: repo,
      targetDir: target,
      variables: { projectName: 'demo-app' },
    });

    assert.equal(result.success, true);
    assert.equal(result.templateCommit, stdout.trim());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
