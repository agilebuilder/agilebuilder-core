import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

async function runCli(args: string[], dataDir: string) {
  return execFileAsync(process.execPath, [join(process.cwd(), 'dist', 'cli', 'index.js'), ...args], {
    cwd: process.cwd(),
    env: { ...process.env, AGILEBUILDER_CORE1_DATA_DIR: dataDir },
  });
}

test('CLI can add a local template and create a project from it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-cli-'));
  const dataDir = join(dir, 'data');
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
    await git(repo, ['add', '.']);
    await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);

    await runCli(['res', 'add', 'template', '--name', 'demo', '--git-url', repo, '--branch', 'master', '--json'], dataDir);
    const listText = await runCli(['res', 'list'], dataDir);
    assert.match(listText.stdout, /工作空间 local 中的资源（1）|Resources \(1\)/);
    assert.match(listText.stdout, /ag res get <id>/);

    const detailText = await runCli(['res', 'get', '1'], dataDir);
    assert.match(detailText.stdout, /资源详情|Resource detail/);
    assert.match(detailText.stdout, /demo/);

    const edit = await runCli(['res', 'edit', '1', '--name', 'demo-edited', '--branch', 'master', '--tags', 'smoke,edited', '--json'], dataDir);
    const edited = JSON.parse(edit.stdout);
    assert.equal(edited.ok, true);
    assert.equal(edited.data.name, 'demo-edited');
    assert.deepEqual(edited.data.tags, ['smoke', 'edited']);

    const createText = await runCli(['create', '1', '--target', join(dir, 'target-text'), '--var', 'projectName=cli-text'], dataDir);
    assert.match(createText.stdout, /项目创建成功|Project created successfully/);

    const create = await runCli(['create', '1', '--target', target, '--var', 'projectName=cli-smoke', '--json'], dataDir);
    const parsed = JSON.parse(create.stdout);
    assert.equal(parsed.ok, true);
    assert.match(await readFile(join(target, 'cli-smoke.txt'), 'utf8'), /Hello cli-smoke/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
