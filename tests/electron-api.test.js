import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesktopApiClient } from '../electron/desktop-api.js';

const healthyResponse = (data) => ({
  status: 200,
  headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
  json: async () => ({ code: 200, data: { status: 'ok', ...data }, error: null }),
});

test('desktop API health checks use the shared documented GET /health client in the main process', async () => {
  let savedKeyReads = 0;
  let request;
  const client = createDesktopApiClient({
    credentialStore: { getApiKeyForRequest: async () => { savedKeyReads += 1; return 'stored-secret'; } },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return healthyResponse({ service: 'ACE-Step API', version: '1.2.3' });
    },
  });

  const result = await client.testConnection({ baseUrl: 'https://api.example.test/', apiKey: '' });
  assert.deepEqual(result, { ok: true, service: 'ACE-Step API', version: '1.2.3' });
  assert.equal(savedKeyReads, 1);
  assert.equal(request.url, 'https://api.example.test/health');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers.Authorization, 'Bearer stored-secret');
  assert.equal(JSON.stringify(result).includes('stored-secret'), false);
});

test('typed key is used for one health check and an echoed credential is not returned', async () => {
  let savedKeyReads = 0;
  let request;
  const client = createDesktopApiClient({
    credentialStore: { getApiKeyForRequest: async () => { savedKeyReads += 1; return 'different-stored-secret'; } },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return healthyResponse({ service: 'echo transient-secret', version: 'safe-version' });
    },
  });

  const result = await client.testConnection({
    baseUrl: 'https://api.example.test',
    apiKey: 'transient-secret',
  });
  assert.equal(savedKeyReads, 0);
  assert.equal(request.options.headers.Authorization, 'Bearer transient-secret');
  assert.deepEqual(result, { ok: true, service: 'ACE-Step API', version: 'safe-version' });
  assert.equal(JSON.stringify(result).includes('transient-secret'), false);
});

test('desktop API client does not translate server failures into success', async () => {
  const client = createDesktopApiClient({
    credentialStore: { getApiKeyForRequest: async () => '' },
    fetchImpl: async () => ({
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ code: 401, data: null, error: 'unauthorized' }),
    }),
  });
  await assert.rejects(
    client.testConnection({ baseUrl: 'https://api.example.test', apiKey: '' }),
    { code: 'AUTHENTICATION' },
  );
});
