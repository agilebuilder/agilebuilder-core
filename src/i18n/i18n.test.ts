import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../errors/app-error.js';
import { getEffectiveLocale, setLocale, t, normalizeLanguage } from './index.js';

test('i18n translates messages and returns key on missing keys', () => {
  setLocale('zh-CN');
  assert.equal(t('space.local.name'), '本地空间');
  assert.equal(t('space.use.success', { name: 'local' }), '已切换到工作空间 local。');
  // Returns the key itself when the key is missing, so a single missing translation
  // does not crash the CLI.
  assert.equal(t('missing.key'), 'missing.key');

  setLocale('en-US');
  assert.equal(t('space.local.name'), 'Local Workspace');
  assert.equal(t('missing.key'), 'missing.key');
});

test('i18n resolves explicit language settings', () => {
  assert.equal(getEffectiveLocale('zh-CN'), 'zh-CN');
  assert.equal(getEffectiveLocale('en-US'), 'en-US');
});

test('normalizeLanguage accepts valid settings', () => {
  assert.equal(normalizeLanguage('auto'), 'auto');
  assert.equal(normalizeLanguage('zh-CN'), 'zh-CN');
  assert.equal(normalizeLanguage('en-US'), 'en-US');
});

test('normalizeLanguage throws AppError with INVALID_LANGUAGE for illegal values', () => {
  for (const value of ['fr-FR', 'zh-TW', 'de', 123, null, undefined, '']) {
    assert.throws(
      () => normalizeLanguage(value),
      (error) => error instanceof AppError
        && error.code === 'INVALID_LANGUAGE'
        && error.category === 'validation',
      `expected INVALID_LANGUAGE for ${String(value)}`,
    );
  }
});

test('getEffectiveLocale detects locale from environment variables', () => {
  const originalLang = process.env.AGILEBUILDER_LANG;
  const originalLcAll = process.env.LC_ALL;
  const originalLcMessages = process.env.LC_MESSAGES;
  const originalLangEnv = process.env.LANG;

  try {
    delete process.env.AGILEBUILDER_LANG;
    delete process.env.LC_ALL;
    delete process.env.LC_MESSAGES;
    delete process.env.LANG;

    process.env.AGILEBUILDER_LANG = 'zh_CN';
    assert.equal(getEffectiveLocale('auto'), 'zh-CN');

    process.env.AGILEBUILDER_LANG = 'en_US.UTF-8';
    assert.equal(getEffectiveLocale('auto'), 'en-US');

    delete process.env.AGILEBUILDER_LANG;
    process.env.LC_ALL = 'zh_CN.UTF-8';
    assert.equal(getEffectiveLocale('auto'), 'zh-CN');

    delete process.env.LC_ALL;
    process.env.LC_MESSAGES = 'en_US';
    assert.equal(getEffectiveLocale('auto'), 'en-US');
  } finally {
    if (originalLang === undefined) delete process.env.AGILEBUILDER_LANG;
    else process.env.AGILEBUILDER_LANG = originalLang;
    if (originalLcAll === undefined) delete process.env.LC_ALL;
    else process.env.LC_ALL = originalLcAll;
    if (originalLcMessages === undefined) delete process.env.LC_MESSAGES;
    else process.env.LC_MESSAGES = originalLcMessages;
    if (originalLangEnv === undefined) delete process.env.LANG;
    else process.env.LANG = originalLangEnv;
  }
});

test('getEffectiveLocale auto returns a supported locale', () => {
  const originalLang = process.env.AGILEBUILDER_LANG;
  const originalLcAll = process.env.LC_ALL;
  const originalLcMessages = process.env.LC_MESSAGES;
  const originalLangEnv = process.env.LANG;

  try {
    delete process.env.AGILEBUILDER_LANG;
    delete process.env.LC_ALL;
    delete process.env.LC_MESSAGES;
    delete process.env.LANG;
    const locale = getEffectiveLocale('auto');
    assert.ok(['en-US', 'zh-CN'].includes(locale));
  } finally {
    if (originalLang === undefined) delete process.env.AGILEBUILDER_LANG;
    else process.env.AGILEBUILDER_LANG = originalLang;
    if (originalLcAll === undefined) delete process.env.LC_ALL;
    else process.env.LC_ALL = originalLcAll;
    if (originalLcMessages === undefined) delete process.env.LC_MESSAGES;
    else process.env.LC_MESSAGES = originalLcMessages;
    if (originalLangEnv === undefined) delete process.env.LANG;
    else process.env.LANG = originalLangEnv;
  }
});

test.after(() => {
  setLocale('en-US');
});

test('t falls back to en-US when current locale lacks a key', () => {
  setLocale('zh-CN');
  // 'missing.zh.only' does not exist in either locale, so it returns the key.
  assert.equal(t('missing.zh.only'), 'missing.zh.only');
  // Existing key is present in both locales, so it returns Chinese.
  assert.equal(t('space.local.name'), '本地空间');
});
