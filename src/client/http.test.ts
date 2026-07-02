import assert from 'node:assert/strict';
import test from 'node:test';
import { ClientHttp } from './http.js';
import { AppError } from '../errors/app-error.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('ClientHttp maps API_1008 to RESOURCE_NOT_FOUND', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({ code: 1008, message: '资源不存在', data: null });
  try {
    await assert.rejects(
      () => ClientHttp.get('/test', { token: 't' }),
      (error) => error instanceof AppError
        && error.code === 'RESOURCE_NOT_FOUND'
        && error.category === 'resource',
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('ClientHttp maps API_1011 to PRO_ACCESS_REQUIRED', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({ code: 1011, message: '当前空间未开通 Pro 订阅', data: null });
  try {
    await assert.rejects(
      () => ClientHttp.get('/test', { token: 't' }),
      (error) => error instanceof AppError
        && error.code === 'PRO_ACCESS_REQUIRED'
        && error.category === 'permission',
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('ClientHttp keeps unknown API codes as API_${code}', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({ code: 9999, message: 'Unknown', data: null });
  try {
    await assert.rejects(
      () => ClientHttp.get('/test', { token: 't' }),
      (error) => error instanceof AppError
        && error.code === 'API_9999'
        && error.category === 'network',
    );
  } finally {
    global.fetch = originalFetch;
  }
});
