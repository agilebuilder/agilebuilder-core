import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { AppError } from '../errors/app-error.js';
import { printError } from '../output/format.js';
import { withIsolatedDataDir } from '../test-helpers/data-dir.js';
import { createResCommand } from './res.js';

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: unknown;
}

async function runResCommand(args: string[], dataDir: string): Promise<RunResult> {
  const previousDataDir = process.env.AGILEBUILDER_CORE1_DATA_DIR;
  process.env.AGILEBUILDER_CORE1_DATA_DIR = dataDir;

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = ((...messages: unknown[]) => stdoutLines.push(messages.map(String).join(' '))) as typeof console.log;
  console.error = ((...messages: unknown[]) => stderrLines.push(messages.map(String).join(' '))) as typeof console.error;

  try {
    const command = createResCommand();
    command.exitOverride();
    await command.parseAsync(['node', 'ag', ...args]);
    return { stdout: stdoutLines.join('').trim(), stderr: stderrLines.join('').trim(), exitCode: 0 };
  } catch (error) {
    const isJson = args.includes('--json');
    printError(error, { json: isJson });
    const exitCode = error instanceof AppError
      ? error.exitCode
      : ((error as { exitCode?: number }).exitCode ?? 1);
    return {
      stdout: stdoutLines.join('').trim(),
      stderr: stderrLines.join('').trim(),
      exitCode,
      error,
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    if (previousDataDir === undefined) {
      delete process.env.AGILEBUILDER_CORE1_DATA_DIR;
    } else {
      process.env.AGILEBUILDER_CORE1_DATA_DIR = previousDataDir;
    }
  }
}

test('local resource management CLI', async (t) => {
  await t.test('res add template creates a template with default branch and deduplicated tags', async (t2) => {
    await t2.test('text output', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        const result = await runResCommand(
          ['add', 'template', '--name', 'react-app', '--git-url', 'https://example.com/react.git', '--tags', 'web,react, react,,'],
          dataDir,
        );
        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /Resource saved:/);
        assert.match(result.stdout, /react-app/);
        assert.match(result.stdout, /https:\/\/example\.com\/react\.git/);
      });
    });

    await t2.test('--json output with default branch main', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        const result = await runResCommand(
          ['add', 'template', '--name', 'api', '--git-url', 'https://example.com/api.git', '--json'],
          dataDir,
        );
        assert.equal(result.exitCode, 0);
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed.ok, true);
        assert.equal(parsed.data.type, 'template');
        assert.equal(parsed.data.branch, 'main');
        assert.deepEqual(parsed.data.tags, []);
      });
    });

    await t2.test('tag deduplication and empty filtering', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        const result = await runResCommand(
          ['add', 'template', '--name', 'tagged', '--git-url', 'https://example.com/tagged.git', '--tags', 'a, a,, b, ,a', '--json'],
          dataDir,
        );
        assert.equal(result.exitCode, 0);
        const parsed = JSON.parse(result.stdout);
        assert.deepEqual(parsed.data.tags, ['a', 'b']);
      });
    });

    await t2.test('returns LOCAL_WORKSPACE_UNSUPPORTED_OPTION for --parent-id', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        const result = await runResCommand(
          ['add', 'template', '--name', 'demo', '--git-url', 'https://example.com/demo.git', '--parent-id', 'folder', '--json'],
          dataDir,
        );
        assert.equal(result.exitCode, 1);
        assert.ok(result.error instanceof AppError);
        assert.equal((result.error as AppError).code, 'LOCAL_WORKSPACE_UNSUPPORTED_OPTION');
      });
    });
  });

  await t.test('res add doc creates a doc from content or file', async (t2) => {
    await t2.test('creates doc with --content, default format and uri', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        const result = await runResCommand(
          ['add', 'doc', '--name', 'guide', '--content', 'hello agilebuilder world', '--json'],
          dataDir,
        );
        assert.equal(result.exitCode, 0);
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed.ok, true);
        assert.equal(parsed.data.type, 'doc');
        assert.equal(parsed.data.format, 'markdown');
        assert.equal(parsed.data.uri, 'local-doc://guide');
        assert.equal(parsed.data.wordCount, 3);
      });
    });

    await t2.test('reads content from --file', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        const filePath = join(dataDir, 'input.md');
        await writeFile(filePath, '# Title\n\nbody content', 'utf8');
        const result = await runResCommand(
          ['add', 'doc', '--name', 'from-file', '--file', filePath, '--format', 'text', '--json'],
          dataDir,
        );
        assert.equal(result.exitCode, 0);
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed.data.content, '# Title\n\nbody content');
        assert.equal(parsed.data.format, 'text');
        assert.equal(parsed.data.wordCount, 4);
      });
    });

    await t2.test('returns DOC_CONTENT_REQUIRED when content is missing', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        const result = await runResCommand(['add', 'doc', '--name', 'empty'], dataDir);
        assert.equal(result.exitCode, 1);
        assert.ok(result.error instanceof AppError);
        assert.equal((result.error as AppError).code, 'DOC_CONTENT_REQUIRED');
        assert.match(result.stderr, /Document content is required/);
      });
    });

    await t2.test('returns DOC_FILE_READ_FAILED when file does not exist', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        const result = await runResCommand(
          ['add', 'doc', '--name', 'missing', '--file', join(dataDir, 'missing.md'), '--json'],
          dataDir,
        );
        assert.equal(result.exitCode, 1);
        assert.ok(result.error instanceof AppError);
        assert.equal((result.error as AppError).code, 'DOC_FILE_READ_FAILED');
        const parsed = JSON.parse(result.stderr);
        assert.equal(parsed.ok, false);
        assert.equal(parsed.error.code, 'DOC_FILE_READ_FAILED');
      });
    });
  });

  await t.test('res list and ls show resources or empty state', async (t2) => {
    await t2.test('empty list text output', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        const result = await runResCommand(['list'], dataDir);
        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /No resources found/);
        assert.match(result.stdout, /ag res add template/);
      });
    });

    await t2.test('empty list --json output', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        const result = await runResCommand(['list', '--json'], dataDir);
        assert.equal(result.exitCode, 0);
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed.ok, true);
        assert.deepEqual(parsed.data.items, []);
        assert.equal(parsed.data.total, 0);
        assert.equal(parsed.data.workspaceId, 'local');
      });
    });

    await t2.test('lists items and filters by type', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        await runResCommand(['add', 'template', '--name', 't', '--git-url', 'https://example.com/t.git'], dataDir);
        await runResCommand(['add', 'doc', '--name', 'd', '--content', 'content'], dataDir);

        const all = await runResCommand(['list', '--json'], dataDir);
        assert.equal(JSON.parse(all.stdout).data.total, 2);

        const templates = await runResCommand(['list', '--type', 'template', '--json'], dataDir);
        assert.equal(JSON.parse(templates.stdout).data.total, 1);
        assert.equal(JSON.parse(templates.stdout).data.items[0].type, 'template');

        const ls = await runResCommand(['ls'], dataDir);
        assert.match(ls.stdout, /Resources \(2\) in workspace local/);
      });
    });

    await t2.test('returns UNSUPPORTED_RESOURCE_TYPE for invalid --type', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        const result = await runResCommand(['list', '--type', 'invalid', '--json'], dataDir);
        assert.equal(result.exitCode, 1);
        assert.ok(result.error instanceof AppError);
        assert.equal((result.error as AppError).code, 'UNSUPPORTED_RESOURCE_TYPE');
        const parsed = JSON.parse(result.stderr);
        assert.equal(parsed.error.code, 'UNSUPPORTED_RESOURCE_TYPE');
      });
    });
  });

  await t.test('res search matches keywords case-insensitively across fields', async (t2) => {
    await t2.test('matches name, description, tags and content', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        await runResCommand(
          ['add', 'template', '--name', 'ReactApp', '--git-url', 'https://example.com/react.git', '--description', 'frontend', '--tags', 'ui'],
          dataDir,
        );
        await runResCommand(
          ['add', 'doc', '--name', 'BackendGuide', '--content', 'AGILEBUILDER tutorial', '--tags', 'api'],
          dataDir,
        );

        const byName = await runResCommand(['search', 'reactapp', '--json'], dataDir);
        assert.equal(JSON.parse(byName.stdout).data.total, 1);

        const byDesc = await runResCommand(['search', 'FRONTEND', '--json'], dataDir);
        assert.equal(JSON.parse(byDesc.stdout).data.total, 1);

        const byTag = await runResCommand(['search', 'api', '--json'], dataDir);
        assert.equal(JSON.parse(byTag.stdout).data.total, 1);

        const byContent = await runResCommand(['search', 'agilebuilder', '--json'], dataDir);
        assert.equal(JSON.parse(byContent.stdout).data.total, 1);

        const none = await runResCommand(['search', 'nomatch'], dataDir);
        assert.match(none.stdout, /No resources found/);
      });
    });
  });

  await t.test('res get shows detail or RESOURCE_NOT_FOUND', async (t2) => {
    await t2.test('text detail for existing resource', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        await runResCommand(['add', 'template', '--name', 'demo', '--git-url', 'https://example.com/demo.git'], dataDir);
        const result = await runResCommand(['get', '1'], dataDir);
        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /Resource detail:/);
        assert.match(result.stdout, /demo/);
      });
    });

    await t2.test('--json detail for existing resource', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        await runResCommand(['add', 'doc', '--name', 'doc', '--content', 'hello'], dataDir);
        const result = await runResCommand(['get', '1', '--json'], dataDir);
        assert.equal(result.exitCode, 0);
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed.ok, true);
        assert.equal(parsed.data.type, 'doc');
      });
    });

    await t2.test('returns RESOURCE_NOT_FOUND in text mode', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        const result = await runResCommand(['get', '999'], dataDir);
        assert.equal(result.exitCode, 1);
        assert.ok(result.error instanceof AppError);
        assert.equal((result.error as AppError).code, 'RESOURCE_NOT_FOUND');
        assert.match(result.stderr, /Resource not found/);
      });
    });

    await t2.test('returns RESOURCE_NOT_FOUND in --json mode', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        const result = await runResCommand(['get', '999', '--json'], dataDir);
        assert.equal(result.exitCode, 1);
        const parsed = JSON.parse(result.stderr);
        assert.equal(parsed.ok, false);
        assert.equal(parsed.error.code, 'RESOURCE_NOT_FOUND');
      });
    });
  });

  await t.test('res edit updates resources and validates options', async (t2) => {
    await t2.test('updates a template and deduplicates tags', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        await runResCommand(['add', 'template', '--name', 'demo', '--git-url', 'https://example.com/demo.git'], dataDir);
        const result = await runResCommand(
          ['edit', '1', '--name', 'demo-edited', '--branch', 'develop', '--tags', 'a, a, b', '--json'],
          dataDir,
        );
        assert.equal(result.exitCode, 0);
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed.data.name, 'demo-edited');
        assert.equal(parsed.data.branch, 'develop');
        assert.deepEqual(parsed.data.tags, ['a', 'b']);
      });
    });

    await t2.test('updates a doc from --file and recalculates word count', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        await runResCommand(['add', 'doc', '--name', 'doc', '--content', 'old content'], dataDir);
        const filePath = join(dataDir, 'updated.md');
        await writeFile(filePath, 'new content here', 'utf8');
        const result = await runResCommand(['edit', '1', '--file', filePath, '--json'], dataDir);
        assert.equal(result.exitCode, 0);
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed.data.wordCount, 3);
      });
    });

    await t2.test('returns RESOURCE_EDIT_FIELD_REQUIRED when no fields provided', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        await runResCommand(['add', 'template', '--name', 'demo', '--git-url', 'https://example.com/demo.git'], dataDir);
        const result = await runResCommand(['edit', '1', '--json'], dataDir);
        assert.equal(result.exitCode, 1);
        assert.ok(result.error instanceof AppError);
        assert.equal((result.error as AppError).code, 'RESOURCE_EDIT_FIELD_REQUIRED');
      });
    });

    await t2.test('returns RESOURCE_EDIT_CONTENT_CONFLICT when both --file and --content are used', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        await runResCommand(['add', 'doc', '--name', 'doc', '--content', 'content'], dataDir);
        const filePath = join(dataDir, 'x.md');
        await writeFile(filePath, 'x', 'utf8');
        const result = await runResCommand(['edit', '1', '--file', filePath, '--content', 'y', '--json'], dataDir);
        assert.equal(result.exitCode, 1);
        assert.ok(result.error instanceof AppError);
        assert.equal((result.error as AppError).code, 'RESOURCE_EDIT_CONTENT_CONFLICT');
      });
    });

    await t2.test('returns RESOURCE_EDIT_TYPE_MISMATCH for doc fields on template', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        await runResCommand(['add', 'template', '--name', 'demo', '--git-url', 'https://example.com/demo.git'], dataDir);
        const result = await runResCommand(['edit', '1', '--content', 'x', '--json'], dataDir);
        assert.equal(result.exitCode, 1);
        assert.ok(result.error instanceof AppError);
        assert.equal((result.error as AppError).code, 'RESOURCE_EDIT_TYPE_MISMATCH');
      });
    });

    await t2.test('returns RESOURCE_EDIT_TYPE_MISMATCH for template fields on doc', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        await runResCommand(['add', 'doc', '--name', 'doc', '--content', 'content'], dataDir);
        const result = await runResCommand(['edit', '1', '--git-url', 'https://example.com/t.git', '--json'], dataDir);
        assert.equal(result.exitCode, 1);
        assert.ok(result.error instanceof AppError);
        assert.equal((result.error as AppError).code, 'RESOURCE_EDIT_TYPE_MISMATCH');
      });
    });

    await t2.test('returns LOCAL_WORKSPACE_UNSUPPORTED_OPTION for --parent-id', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        await runResCommand(['add', 'template', '--name', 'demo', '--git-url', 'https://example.com/demo.git'], dataDir);
        const result = await runResCommand(['edit', '1', '--name', 'x', '--parent-id', 'folder', '--json'], dataDir);
        assert.equal(result.exitCode, 1);
        assert.ok(result.error instanceof AppError);
        assert.equal((result.error as AppError).code, 'LOCAL_WORKSPACE_UNSUPPORTED_OPTION');
      });
    });

    await t2.test('returns RESOURCE_NOT_FOUND for missing id', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        const result = await runResCommand(['edit', '999', '--name', 'x', '--json'], dataDir);
        assert.equal(result.exitCode, 1);
        assert.ok(result.error instanceof AppError);
        assert.equal((result.error as AppError).code, 'RESOURCE_NOT_FOUND');
      });
    });
  });

  await t.test('res remove and rm require confirmation and delete resources', async (t2) => {
    await t2.test('returns CONFIRMATION_REQUIRED without --yes', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        await runResCommand(['add', 'template', '--name', 'demo', '--git-url', 'https://example.com/demo.git'], dataDir);
        const result = await runResCommand(['remove', '1'], dataDir);
        assert.equal(result.exitCode, 1);
        assert.ok(result.error instanceof AppError);
        assert.equal((result.error as AppError).code, 'CONFIRMATION_REQUIRED');
      });
    });

    await t2.test('removes a resource with --yes text output', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        await runResCommand(['add', 'template', '--name', 'demo', '--git-url', 'https://example.com/demo.git'], dataDir);
        const result = await runResCommand(['remove', '1', '--yes'], dataDir);
        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /Resource removed/);
        const list = await runResCommand(['list', '--json'], dataDir);
        assert.equal(JSON.parse(list.stdout).data.total, 0);
      });
    });

    await t2.test('removes a resource with --yes --json output using rm alias', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        await runResCommand(['add', 'doc', '--name', 'doc', '--content', 'content'], dataDir);
        const result = await runResCommand(['rm', '1', '--yes', '--json'], dataDir);
        assert.equal(result.exitCode, 0);
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed.ok, true);
        assert.equal(parsed.data.id, '1');
      });
    });

    await t2.test('returns RESOURCE_NOT_FOUND when id does not exist', async () => {
      await withIsolatedDataDir(async (dataDir) => {
        const result = await runResCommand(['remove', '999', '--yes', '--json'], dataDir);
        assert.equal(result.exitCode, 1);
        assert.ok(result.error instanceof AppError);
        assert.equal((result.error as AppError).code, 'RESOURCE_NOT_FOUND');
      });
    });
  });
});
