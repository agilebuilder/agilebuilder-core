import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../errors/app-error.js';
import { printError, writeSuccess } from './format.js';

test('writeSuccess outputs JSON wrapper in JSON mode', () => {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  try {
    writeSuccess({ name: 'demo' }, { json: true });
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]!);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.data, { name: 'demo' });
  } finally {
    console.log = originalLog;
  }
});

test('writeSuccess uses text renderer in text mode', () => {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  try {
    writeSuccess({ name: 'demo' }, {}, (data) => `Rendered: ${data.name}`);
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /Rendered: demo/);
  } finally {
    console.log = originalLog;
  }
});

test('writeSuccess falls back to data output when no renderer is provided', () => {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  try {
    writeSuccess('plain message', {});
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!, 'plain message');
  } finally {
    console.log = originalLog;
  }
});

test('printError outputs structured JSON in JSON mode', () => {
  const originalError = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => lines.push(args.join(' '));
  try {
    const error = new AppError({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Resource missing.',
      suggestion: 'Check the resource id.',
      category: 'resource',
    });
    printError(error, { json: true });
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]!);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, 'RESOURCE_NOT_FOUND');
    assert.equal(parsed.error.message, 'Resource missing.');
    assert.equal(parsed.error.suggestion, 'Check the resource id.');
    assert.equal(parsed.error.category, 'resource');
  } finally {
    console.error = originalError;
  }
});

test('printError outputs red error and suggestion in text mode', () => {
  const originalError = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => lines.push(args.join(' '));
  try {
    const error = new AppError({
      code: 'INVALID_LANGUAGE',
      message: 'Invalid language.',
      suggestion: 'Use one of: auto, zh-CN, en-US.',
      category: 'validation',
    });
    printError(error, {});
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /Error.*Invalid language/);
    assert.match(lines[1]!, /Use one of: auto, zh-CN, en-US/);
  } finally {
    console.error = originalError;
  }
});

test('printError wraps non-AppError values as UNEXPECTED_ERROR', () => {
  const originalError = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => lines.push(args.join(' '));
  try {
    printError('boom', { json: true });
    const parsed = JSON.parse(lines[0]!);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, 'UNEXPECTED_ERROR');
    assert.equal(parsed.error.message, 'boom');
  } finally {
    console.error = originalError;
  }
});
