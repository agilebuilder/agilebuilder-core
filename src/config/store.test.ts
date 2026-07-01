import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { withIsolatedDataDir } from '../test-helpers/data-dir.js';

process.env.AGILEBUILDER_LANG = 'en-US';

async function importStore() {
  return import(`./store.js?case=${Date.now()}`);
}

test('ConfigStore.load returns defaults when config file is missing', async () => {
  await withIsolatedDataDir(async () => {
    const { ConfigStore } = await importStore();
    assert.deepEqual(ConfigStore.load(), {
      backend: { profile: 'auto' },
      language: 'auto',
      template: { allowHooksDefault: false },
    });
  });
});

test('ConfigStore.save and load roundtrip', async () => {
  await withIsolatedDataDir(async () => {
    const { ConfigStore } = await importStore();
    const config = {
      backend: { profile: 'china' as const },
      language: 'en-US' as const,
      template: { allowHooksDefault: true },
    };
    ConfigStore.save(config);
    const loaded = ConfigStore.load();
    assert.deepEqual(loaded, config);
  });
});

test('ConfigStore.load falls back to defaults on corrupt JSON', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const configPath = join(dataDir, 'config.json');
    await writeFile(configPath, '{ broken', 'utf8');

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };

    try {
      const { ConfigStore } = await importStore();
      const loaded = ConfigStore.load();
      assert.equal(loaded.backend.profile, 'auto');
      assert.equal(loaded.language, 'auto');
      assert.equal(loaded.template.allowHooksDefault, false);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /Failed to load configuration/);
    } finally {
      console.warn = originalWarn;
    }
  });
});

test('ConfigStore.save writes atomically via temp file and rename', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const { ConfigStore } = await importStore();
    ConfigStore.save({
      backend: { profile: 'global' as const },
      language: 'en-US' as const,
      template: { allowHooksDefault: false },
    });

    const configPath = join(dataDir, 'config.json');
    const fs = await import('node:fs/promises');
    const files = await fs.readdir(dataDir);
    const tempFiles = files.filter((f) => f.startsWith('config.json.') && f.endsWith('.tmp'));
    assert.equal(tempFiles.length, 0, 'No leftover temp files after atomic save');

    const content = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(content);
    assert.equal(parsed.backend.profile, 'global');
  });
});

test('ConfigStore.get rejects unknown paths', async () => {
  await withIsolatedDataDir(async () => {
    const { ConfigStore } = await importStore();
    assert.throws(() => ConfigStore.get('not.a.key'), /Unknown config key/);
  });
});

test('ConfigStore.set rejects unknown paths', async () => {
  await withIsolatedDataDir(async () => {
    const { ConfigStore } = await importStore();
    assert.throws(() => ConfigStore.set('not.a.key', 'value'), /Unknown config key/);
  });
});

test('ConfigStore.set parses true, false, number and string values', async () => {
  await withIsolatedDataDir(async () => {
    const { ConfigStore } = await importStore();
    ConfigStore.set('template.allowHooksDefault', 'true');
    assert.equal(ConfigStore.get('template.allowHooksDefault'), true);

    ConfigStore.set('template.allowHooksDefault', 'false');
    assert.equal(ConfigStore.get('template.allowHooksDefault'), false);

    assert.throws(
      () => ConfigStore.set('backend.profile', '42'),
      /Invalid backend\.profile: 42/,
      'number string is parsed as number before validation',
    );

    ConfigStore.set('backend.profile', 'global');
    assert.equal(ConfigStore.get('backend.profile'), 'global');
  });
});

test('ConfigStore.set persists configuration to disk', async () => {
  await withIsolatedDataDir(async () => {
    const { ConfigStore } = await importStore();
    ConfigStore.set('language', 'zh-CN');

    const { ConfigStore: ReloadedStore } = await importStore();
    assert.equal(ReloadedStore.get('language'), 'zh-CN');
  });
});
