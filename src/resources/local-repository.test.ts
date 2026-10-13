import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { AppError } from '../errors/app-error.js';
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


test('LocalResourceRepository nextId increments across multiple adds', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-res-nextid-'));
  try {
    const repository = new LocalResourceRepository(join(dir, 'local.json'));
    const t1 = await repository.addTemplate({ name: 't1', gitUrl: 'https://example.com/t1.git' });
    const d1 = await repository.addDoc({ name: 'd1', uri: 'local-doc://d1', content: 'hello' });
    const t2 = await repository.addTemplate({ name: 't2', gitUrl: 'https://example.com/t2.git' });
    assert.equal(t1.id, '1');
    assert.equal(d1.id, '2');
    assert.equal(t2.id, '3');

    const store = JSON.parse(await readFile(join(dir, 'local.json'), 'utf8'));
    assert.equal(store.nextId, 4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('LocalResourceRepository tag deduplication and empty filtering', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-res-tags-'));
  try {
    const repository = new LocalResourceRepository(join(dir, 'local.json'));
    const resource = await repository.addTemplate({
      name: 'tagged',
      gitUrl: 'https://example.com/tagged.git',
      tags: ['a', 'b', 'a', '', '  ', ' b ', 'c'],
    });
    assert.deepEqual(resource.tags, ['a', 'b', 'c']);

    const found = await repository.list({ keyword: 'b' });
    assert.equal(found.length, 1);
    assert.equal(found[0]?.id, resource.id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('LocalResourceRepository doc word count boundaries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-res-words-'));
  try {
    const repository = new LocalResourceRepository(join(dir, 'local.json'));
    const empty = await repository.addDoc({ name: 'empty', uri: 'local-doc://empty', content: '' });
    assert.equal(empty.wordCount, 0);

    const whitespace = await repository.addDoc({ name: 'ws', uri: 'local-doc://ws', content: '   \n\t  ' });
    assert.equal(whitespace.wordCount, 0);

    const single = await repository.addDoc({ name: 'single', uri: 'local-doc://single', content: 'hello' });
    assert.equal(single.wordCount, 1);

    const multiple = await repository.addDoc({
      name: 'multiple',
      uri: 'local-doc://multiple',
      content: '  hello   agilebuilder  world  ',
    });
    assert.equal(multiple.wordCount, 3);

    const updated = await repository.update(multiple.id, { content: 'one two three four' });
    assert.equal(updated?.type, 'doc');
    if (updated?.type === 'doc') {
      assert.equal(updated.wordCount, 4);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('LocalResourceRepository returns null for missing id and throws on require', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-res-missing-'));
  try {
    const repository = new LocalResourceRepository(join(dir, 'local.json'));
    assert.equal(await repository.get('nonexistent'), null);
    await assert.rejects(
      () => repository.require('nonexistent'),
      (error) => error instanceof AppError && error.code === 'RESOURCE_NOT_FOUND',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('LocalResourceRepository rejects corrupted JSON store', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-res-corrupt-'));
  try {
    const filePath = join(dir, 'local.json');
    await writeFile(filePath, '{ invalid json', 'utf8');
    const repository = new LocalResourceRepository(filePath);
    await assert.rejects(
      () => repository.list(),
      (error) => error instanceof Error && /JSON|Unexpected token/i.test(error.message),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('LocalResourceRepository rejects unsupported store version', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-res-version-'));
  try {
    const filePath = join(dir, 'local.json');
    await writeFile(filePath, JSON.stringify({ version: 99, nextId: 1, items: [] }), 'utf8');
    const repository = new LocalResourceRepository(filePath);
    await assert.rejects(
      () => repository.list(),
      (error) => error instanceof Error && error.message.includes('Unsupported local resource store version'),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('LocalResourceRepository rejects invalid nextId', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-res-nextid-invalid-'));
  try {
    const filePath = join(dir, 'local.json');
    await writeFile(filePath, JSON.stringify({ version: 1, nextId: -1, items: [] }), 'utf8');
    const repository = new LocalResourceRepository(filePath);
    await assert.rejects(
      () => repository.list(),
      (error) => error instanceof Error && error.message.includes('nextId must be a positive integer'),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('LocalResourceRepository update keeps word count when content is unchanged', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-res-keepwc-'));
  try {
    const repository = new LocalResourceRepository(join(dir, 'local.json'));
    const doc = await repository.addDoc({ name: 'keep', uri: 'local-doc://keep', content: 'one two three' });
    const updated = await repository.update(doc.id, { name: 'keep-renamed' });
    assert.equal(updated?.type, 'doc');
    if (updated?.type === 'doc') {
      assert.equal(updated.wordCount, 3);
      assert.equal(updated.content, 'one two three');
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('LocalResourceRepository saveTemplateVariables caches the schema on the template', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-core1-res-vars-'));
  try {
    const repository = new LocalResourceRepository(join(dir, 'local.json'));
    const template = await repository.addTemplate({ name: 'web', gitUrl: 'https://example.com/web.git' });

    const saved = await repository.saveTemplateVariables(template.id, [
      { name: 'projectName', type: 'input', message: 'Project name', required: true },
    ]);
    assert.equal(saved?.variables?.length, 1);
    assert.equal(saved?.variables?.[0].name, 'projectName');

    const reloaded = await repository.get(template.id);
    assert.equal(reloaded?.type, 'template');
    if (reloaded?.type === 'template') {
      assert.equal(reloaded.variables?.[0].required, true);
    }

    assert.equal(await repository.saveTemplateVariables('999', []), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
