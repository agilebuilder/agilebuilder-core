import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    await writeFile(join(repo, 'agilebuilder.yaml'), [
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
    assert.equal(result.configFile, 'agilebuilder.yaml');
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
    await writeFile(join(repo, 'agilebuilder.yaml'), [
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
