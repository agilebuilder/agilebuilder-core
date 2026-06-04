import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
