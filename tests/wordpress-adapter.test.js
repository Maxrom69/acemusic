import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWordPressAdapter,
  WordPressCredentialStore,
  WordPressDeploymentError,
} from '../src/adapters/wordpress/createWordPressAdapter.js';
import { ApiConnectionError } from '../src/core/api/aceStepClient.js';

const siteLocation = {
  origin: 'https://cms.example.test',
  protocol: 'https:',
  hostname: 'cms.example.test',
};

function makeRoot(overrides = {}) {
  return {
    dataset: {
      wpNonce: 'nonce-test',
      wpHealthUrl: '/wp-json/acemusic/v1/health-test',
      wpCredentialsUrl: '/wp-json/acemusic/v1/credentials',
      wpCredentialStatusUrl: '/wp-json/acemusic/v1/credential-status',
      wpMusicModelsUrl: '/wp-json/acemusic/v1/music/models',
      wpMusicGenerateUrl: '/wp-json/acemusic/v1/music/generate',
      wpMusicQueryUrl: '/wp-json/acemusic/v1/music/query',
      wpMusicAudioUrl: '/wp-json/acemusic/v1/music/audio',
      ...overrides,
    },
  };
}

function response(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const healthy = {
  data: { status: 'ok', service: 'ACE-Step API', version: '1.0' },
  code: 200,
  error: null,
};

test('WordPress credential adapter never returns raw saved credentials to the browser', async () => {
  const calls = [];
  const adapter = createWordPressAdapter(makeRoot(), {
    locationRef: siteLocation,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(200, { configured: true });
    },
  });

  assert.equal(await adapter.credentialStore.getApiKey(), '');
  assert.equal(await adapter.credentialStore.hasApiKey(), true);
  assert.equal(calls[0].url, 'https://cms.example.test/wp-json/acemusic/v1/credential-status');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.headers['X-WP-Nonce'], 'nonce-test');
});

test('saving a credential sends it only to the same-origin WordPress REST route', async () => {
  const calls = [];
  const adapter = createWordPressAdapter(makeRoot(), {
    locationRef: siteLocation,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(200, { configured: true });
    },
  });

  await adapter.credentialStore.setApiKey('  user-secret  ');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://cms.example.test/wp-json/acemusic/v1/credentials');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(calls[0].options.body), { apiKey: 'user-secret' });
});

test('connection tests keep the ACE-Step health request behind the WordPress server proxy', async () => {
  let request;
  const adapter = createWordPressAdapter(makeRoot(), {
    locationRef: siteLocation,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response(200, healthy, { 'X-AceMusic-Upstream-Response': '1' });
    },
  });

  const result = await adapter.apiClient.testConnection({
    baseUrl: 'https://api.example.test/v1/',
    apiKey: 'test-secret',
  });

  assert.deepEqual(result, { ok: true, service: 'ACE-Step API', version: '1.0' });
  assert.equal(request.url, 'https://cms.example.test/wp-json/acemusic/v1/health-test');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.headers['X-WP-Nonce'], 'nonce-test');
  assert.deepEqual(JSON.parse(request.options.body), {
    baseUrl: 'https://api.example.test/v1',
    apiKey: 'test-secret',
  });
  assert.equal(request.options.headers.Authorization, undefined);
});

test('upstream authentication errors remain API errors instead of WordPress login errors', async () => {
  const adapter = createWordPressAdapter(makeRoot(), {
    locationRef: siteLocation,
    fetchImpl: async () => response(401, { detail: 'The API rejected the supplied credentials.' }, {
      'X-AceMusic-Upstream-Response': '1',
    }),
  });

  await assert.rejects(
    adapter.apiClient.testConnection({ baseUrl: 'https://api.example.test', apiKey: 'bad-key' }),
    (error) => error instanceof ApiConnectionError && error.code === 'AUTHENTICATION',
  );
});

test('a missing WordPress REST route is not misreported as an upstream API endpoint error', async () => {
  const adapter = createWordPressAdapter(makeRoot(), {
    locationRef: siteLocation,
    fetchImpl: async () => response(404, {
      code: 'rest_no_route',
      message: 'No route was found matching the URL and request method.',
      data: { status: 404 },
    }),
  });

  await assert.rejects(
    adapter.apiClient.testConnection({ baseUrl: 'https://api.example.test', apiKey: '' }),
    (error) => error instanceof ApiConnectionError && error.code === 'WORDPRESS_ROUTE',
  );
});

test('remote HTTP cannot carry typed or saved credentials from the WordPress adapter', async () => {
  const credentialStore = new WordPressCredentialStore({
    credentialsUrl: '/wp-json/acemusic/v1/credentials',
    statusUrl: '/wp-json/acemusic/v1/credential-status',
    locationRef: { origin: 'http://cms.example.test', protocol: 'http:', hostname: 'cms.example.test' },
    fetchImpl: async () => assert.fail('No request should be made over insecure remote HTTP.'),
  });

  await assert.rejects(
    credentialStore.setApiKey('private-key'),
    (error) => error instanceof WordPressDeploymentError && error.code === 'INSECURE_WORDPRESS_ORIGIN',
  );
});

test('WordPress REST endpoint configuration cannot redirect a nonce or key cross-origin', () => {
  assert.throws(
    () => createWordPressAdapter(makeRoot({ wpCredentialsUrl: 'https://attacker.example/collect' }), {
      locationRef: siteLocation,
      fetchImpl: async () => response(200, {}),
    }),
    (error) => error instanceof WordPressDeploymentError && error.code === 'WORDPRESS_CONFIG',
  );
});

test('delete clears the WordPress-side credential without reading it into the browser', async () => {
  let request;
  const adapter = createWordPressAdapter(makeRoot(), {
    locationRef: siteLocation,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response(200, { configured: false });
    },
  });

  await adapter.credentialStore.clearApiKey();
  assert.equal(request.options.method, 'DELETE');
  assert.equal(request.url, 'https://cms.example.test/wp-json/acemusic/v1/credentials');
});
