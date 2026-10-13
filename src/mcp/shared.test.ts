import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../errors/app-error.js';
import { errorResult } from './shared.js';
import { SERVER_INSTRUCTIONS } from './server-instructions.js';

interface ErrorPayload {
  ok: false;
  error: {
    code: string;
    message: string;
    suggestion?: string;
    category: string;
  };
}

function parsePayload(result: ReturnType<typeof errorResult>): ErrorPayload {
  assert.equal(result.isError, true);
  return JSON.parse(result.content[0].text) as ErrorPayload;
}

test('errorResult sets isError and wraps AppError fields', () => {
  const result = errorResult(new AppError({
    code: 'SOME_UNKNOWN_CODE',
    message: 'boom',
    suggestion: 'original suggestion',
    category: 'validation',
  }));
  const payload = parsePayload(result);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'SOME_UNKNOWN_CODE');
  assert.equal(payload.error.message, 'boom');
  assert.equal(payload.error.suggestion, 'original suggestion');
});

test('errorResult replaces CLI-only suggestions with MCP-actionable guidance', () => {
  const cases: Array<[string, RegExp]> = [
    ['TEMPLATE_VARS_MISSING', /retry create_project with them in the variables object/],
    ['TARGET_NOT_EMPTY', /overwrite: true/],
    ['AUTH_TOKEN_UNAVAILABLE', /ag login/],
    ['PRO_ACCESS_REQUIRED', /Pro or Trial/],
    ['CLOUD_WORKSPACE_REQUIRED', /ag login/],
    ['RESOURCE_NOT_FOUND', /list_resources or search_resources/],
  ];
  for (const [code, pattern] of cases) {
    const result = errorResult(new AppError({
      code,
      message: 'failed',
      suggestion: 'Use --interactive or other CLI-only flags.',
      category: 'validation',
    }));
    const payload = parsePayload(result);
    assert.match(payload.error.suggestion ?? '', pattern, `code ${code} should be remapped`);
    assert.ok(!payload.error.suggestion?.includes('--interactive'), `code ${code} must not leak CLI-only flags`);
  }
});

test('errorResult keeps UNEXPECTED_ERROR shape for non-AppError values', () => {
  const payload = parsePayload(errorResult(new Error('kaboom')));
  assert.equal(payload.error.code, 'UNEXPECTED_ERROR');
  assert.equal(payload.error.message, 'kaboom');
});

test('server instructions describe purpose, workflow, and hard rules', () => {
  assert.match(SERVER_INSTRUCTIONS, /not a general-purpose code generator/);
  assert.match(SERVER_INSTRUCTIONS, /search_resources/);
  assert.match(SERVER_INSTRUCTIONS, /get_resource/);
  assert.match(SERVER_INSTRUCTIONS, /create_project/);
  assert.match(SERVER_INSTRUCTIONS, /allowHooks: true/);
  assert.match(SERVER_INSTRUCTIONS, /overwrite: true/);
  assert.match(SERVER_INSTRUCTIONS, /ok: false/);
});
