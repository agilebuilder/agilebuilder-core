import assert from 'node:assert/strict';
import test from 'node:test';
import { getEffectiveLocale, setLocale, t } from './index.js';

test('i18n translates messages and falls back to en-US keys', () => {
  setLocale('zh-CN');
  assert.equal(t('space.local.name'), '本地空间');
  assert.equal(t('space.use.success', { name: 'local' }), '已切换到工作空间 local。');

  setLocale('en-US');
  assert.equal(t('space.local.name'), 'Local Workspace');
  assert.equal(t('missing.key'), 'missing.key');
});

test('i18n resolves explicit language settings', () => {
  assert.equal(getEffectiveLocale('zh-CN'), 'zh-CN');
  assert.equal(getEffectiveLocale('en-US'), 'en-US');
});
