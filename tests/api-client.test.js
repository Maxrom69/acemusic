import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiConnectionError, testAceStepConnection } from '../src/core/api/aceStepClient.js';

function makeResponse(status, payload, { contentType = 'application/json', retryAfter } = {}) {
  return {
    status,
    headers: {
      get(name) {
        if (name.toLowerCase() === 'content-type') return contentType;
        if (name.toLowerCase() === 'retry-after') return retryAfter ?? null;
        return null;
      },
    },
    async json() {
      if (payload instanceof Error) throw payload;
      return payload;
    },
  };
}

const healthy = {
  data: { status: 'ok', service: 'ACE-Step API', version: '1.0' },
  code: 200,
  error: null,
  timestamp: 1700000000000,
  extra: null,
};

test('calls the documented GET /health route with the bearer header and validates the response', async () => {
  let request;
  const result = await testAceStepConnection({
    baseUrl: 'https://api.example.test/v1/',
    apiKey: 'secret-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return makeResponse(200, healthy);
    },
  });

  assert.equal(request.url, 'https://api.example.test/v1/health');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers.Authorization, 'Bearer secret-key');
  assert.equal(request.options.body, undefined);
  assert.deepEqual(result, { ok: true, service: 'ACE-Step API', version: '1.0' });
});

test('does not add an authorization header when no key is configured', async () => {
  let headers;
  await testAceStepConnection({
    baseUrl: 'https://api.example.test',
    fetchImpl: async (_url, options) => {
      headers = options.headers;
      return makeResponse(200, healthy);
    },
  });
  assert.equal(Object.hasOwn(headers, 'Authorization'), false);
});

test('rejects invalid URLs before making a request', async () => {
  let called = false;
  await assert.rejects(
    testAceStepConnection({ baseUrl: 'ftp://bad.test', fetchImpl: async () => { called = true; } }),
  );
  assert.equal(called, false);
});

test('does not send API keys over non-loopback HTTP', async () => {
  let called = false;
  await assert.rejects(
    testAceStepConnection({ baseUrl: 'http://api.example.test', apiKey: 'secret', fetchImpl: async () => { called = true; } }),
    (error) => error instanceof ApiConnectionError && error.code === 'INSECURE_ENDPOINT',
  );
  assert.equal(called, false);
});

test('maps HTTP authentication errors to an actionable message', async () => {
  await assert.rejects(
    testAceStepConnection({ baseUrl: 'https://api.example.test', fetchImpl: async () => makeResponse(401, {}) }),
    (error) => error.code === 'AUTHENTICATION' && /API key/.test(error.message),
  );
});

test('maps HTTP rate limiting and includes a documented Retry-After delay', async () => {
  await assert.rejects(
    testAceStepConnection({ baseUrl: 'https://api.example.test', fetchImpl: async () => makeResponse(429, {}, { retryAfter: '12' }) }),
    (error) => error.code === 'RATE_LIMITED' && /12 seconds/.test(error.message),
  );
});

test('maps endpoint and server errors without treating them as success', async () => {
  await assert.rejects(
    testAceStepConnection({ baseUrl: 'https://api.example.test', fetchImpl: async () => makeResponse(404, {}) }),
    (error) => error.code === 'ENDPOINT_NOT_FOUND',
  );
  await assert.rejects(
    testAceStepConnection({ baseUrl: 'https://api.example.test', fetchImpl: async () => makeResponse(503, {}) }),
    (error) => error.code === 'SERVER_ERROR',
  );
});

test('rejects a non-JSON, malformed, or undocumented health response', async () => {
  await assert.rejects(
    testAceStepConnection({ baseUrl: 'https://api.example.test', fetchImpl: async () => makeResponse(200, healthy, { contentType: 'text/html' }) }),
    (error) => error.code === 'INVALID_RESPONSE',
  );
  await assert.rejects(
    testAceStepConnection({ baseUrl: 'https://api.example.test', fetchImpl: async () => makeResponse(200, new SyntaxError('bad json')) }),
    (error) => error.code === 'INVALID_RESPONSE',
  );
  await assert.rejects(
    testAceStepConnection({ baseUrl: 'https://api.example.test', fetchImpl: async () => makeResponse(200, { code: 200, data: { status: 'ready' }, error: null }) }),
    (error) => error.code === 'INVALID_RESPONSE',
  );
  for (const code of ['200', 200.5]) {
    await assert.rejects(
      testAceStepConnection({ baseUrl: 'https://api.example.test', fetchImpl: async () => makeResponse(200, { ...healthy, code }) }),
      (error) => error.code === 'INVALID_RESPONSE',
    );
  }
});

test('maps fetch failures to a network/CORS message without exposing request data', async () => {
  await assert.rejects(
    testAceStepConnection({ baseUrl: 'https://api.example.test', apiKey: 'never-echo-this', fetchImpl: async () => { throw new TypeError('offline'); } }),
    (error) => error.code === 'NETWORK_OR_CORS' && !error.message.includes('never-echo-this'),
  );
});

test('enforces timeout even when the supplied fetch implementation ignores abort', async () => {
  await assert.rejects(
    testAceStepConnection({ baseUrl: 'https://api.example.test', timeoutMs: 10, fetchImpl: async () => new Promise(() => {}) }),
    (error) => error.code === 'TIMEOUT',
  );
});
