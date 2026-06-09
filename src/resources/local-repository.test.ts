import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { LocalResourceRepository } from './local-repository.js';

test('LocalResourceRepository stores, searches, and removes local resources', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-res-'));
  try {
    const repository = new LocalResourceRepository(join(dir, 'local.json'));

    const template = await repository.addTemplate({
      name: 'react-app',
      gitUrl: 'https://example.com/react-app.git',
      branch: 'main',
      tags: ['react', 'typescript'],
    });
    const doc = await repository.addDoc({
      name: 'guide',
      uri: 'local-doc://guide',
      content: 'hello agilebuilder',
      tags: ['docs'],
    });

    assert.equal(template.id, '1');
    assert.equal(doc.id, '2');

    const all = await repository.list();
    assert.equal(all.length, 2);

    const templates = await repository.list({ type: 'template' });
    assert.deepEqual(templates.map((item) => item.id), ['1']);

    const search = await repository.list({ keyword: 'agilebuilder' });
    assert.deepEqual(search.map((item) => item.id), ['2']);

    assert.equal((await repository.get('1'))?.name, 'react-app');
    const updatedTemplate = await repository.update('1', {
      name: 'react-api',
      gitUrl: 'https://example.com/react-api.git',
      branch: 'develop',
      tags: ['react', 'api', 'api'],
    });
    assert.equal(updatedTemplate?.type, 'template');
    assert.equal(updatedTemplate?.name, 'react-api');
    assert.deepEqual(updatedTemplate?.tags, ['react', 'api']);
    if (updatedTemplate?.type === 'template') {
      assert.equal(updatedTemplate.gitUrl, 'https://example.com/react-api.git');
      assert.equal(updatedTemplate.branch, 'develop');
    }

    const updatedDoc = await repository.update('2', {
      content: 'hello updated agilebuilder document',
      format: 'text',
    });
    assert.equal(updatedDoc?.type, 'doc');
    if (updatedDoc?.type === 'doc') {
      assert.equal(updatedDoc.wordCount, 4);
      assert.equal(updatedDoc.format, 'text');
    }
    assert.equal(await repository.update('missing', { name: 'missing' }), null);

    assert.equal(await repository.remove('1'), true);
    assert.equal(await repository.remove('missing'), false);
    assert.equal((await repository.list()).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
