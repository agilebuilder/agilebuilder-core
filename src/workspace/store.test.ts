import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { withIsolatedDataDir } from '../test-helpers/data-dir.js';

async function importStore() {
  return import(`./store.js?case=${Date.now()}`);
}

test('WorkspaceStore.getCurrent returns local when file is missing', async () => {
  await withIsolatedDataDir(async () => {
    const { WorkspaceStore } = await importStore();
    const { LOCAL_SPACE_ID } = await import('../shared/constants.js');
    const current = WorkspaceStore.getCurrent();
    assert.equal(current.id, LOCAL_SPACE_ID);
    assert.ok(typeof current.selectedAt === 'string');
  });
});

test('WorkspaceStore.getCurrent falls back to local when file is corrupt', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const currentSpacePath = join(dataDir, 'current-space.json');
    await writeFile(currentSpacePath, '{ invalid json', 'utf8');

    const { WorkspaceStore } = await importStore();
    const { LOCAL_SPACE_ID } = await import('../shared/constants.js');
    const current = WorkspaceStore.getCurrent();
    assert.equal(current.id, LOCAL_SPACE_ID);
  });
});

test('WorkspaceStore.setCurrent persists id and selectedAt', async () => {
  await withIsolatedDataDir(async () => {
    const { WorkspaceStore } = await importStore();
    const before = WorkspaceStore.setCurrent('space-1');
    assert.equal(before.id, 'space-1');

    const { WorkspaceStore: ReloadedStore } = await importStore();
    const current = ReloadedStore.getCurrent();
    assert.equal(current.id, 'space-1');
    assert.equal(current.selectedAt, before.selectedAt);
  });
});

test('WorkspaceStore.getCurrent ignores invalid object shape', async () => {
  await withIsolatedDataDir(async (dataDir) => {
    const currentSpacePath = join(dataDir, 'current-space.json');
    await writeFile(currentSpacePath, JSON.stringify({ selectedAt: '2026-01-01T00:00:00.000Z' }), 'utf8');

    const { WorkspaceStore } = await importStore();
    const { LOCAL_SPACE_ID } = await import('../shared/constants.js');
    const current = WorkspaceStore.getCurrent();
    assert.equal(current.id, LOCAL_SPACE_ID);
  });
});
