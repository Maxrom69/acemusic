import assert from 'node:assert/strict';
import test from 'node:test';
import { createWordPressAdapter } from '../src/adapters/wordpress/createWordPressAdapter.js';

const locationRef = { origin: 'https://cms.example.test', protocol: 'https:', hostname: 'cms.example.test' };
const baseUrl = 'https://api.example.test/ace-step';

function makeRoot() {
  return { dataset: {
    wpNonce: 'nonce-music',
    wpHealthUrl: '/wp-json/acemusic/v1/health-test',
    wpCredentialsUrl: '/wp-json/acemusic/v1/credentials',
    wpCredentialStatusUrl: '/wp-json/acemusic/v1/credential-status',
    wpMusicModelsUrl: '/wp-json/acemusic/v1/music/models',
    wpMusicGenerateUrl: '/wp-json/acemusic/v1/music/generate',
    wpMusicQueryUrl: '/wp-json/acemusic/v1/music/query',
    wpMusicAudioUrl: '/wp-json/acemusic/v1/music/audio',
  } };
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-AceMusic-Upstream-Response': '1', ...extraHeaders },
  });
}

test('WordPress model discovery stays same-origin and forwards only the configured service URL and one-off key', async () => {
  let request;
  const adapter = createWordPressAdapter(makeRoot(), {
    locationRef,
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return jsonResponse({ code: 200, data: { models: [{ name: 'acestep-v15', is_default: true }], default_model: 'acestep-v15' }, error: null });
    },
  });

  const result = await adapter.musicClient.listModels({ baseUrl: `${baseUrl}/`, apiKey: 'one-time-key' });
  assert.deepEqual(result, { models: [{ name: 'acestep-v15', isDefault: true }], defaultModel: 'acestep-v15' });
  assert.equal(request.url, 'https://cms.example.test/wp-json/acemusic/v1/music/models');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.headers['X-WP-Nonce'], 'nonce-music');
  assert.equal(request.options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(request.options.body), { baseUrl, apiKey: 'one-time-key' });
});

test('generation and task queries use the narrow same-origin proxy routes', async () => {
  const requests = [];
  const adapter = createWordPressAdapter(makeRoot(), {
    locationRef,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (String(url).endsWith('/music/generate')) {
        return jsonResponse({ code: 200, data: { task_id: 'wp-task-7', status: 'queued', queue_position: 0 }, error: null });
      }
      return jsonResponse({ code: 200, data: [{ task_id: 'wp-task-7', status: 1, result: JSON.stringify([{ file: '/v1/audio?path=%2Ftmp%2Fwp-track.mp3' }]) }], error: null });
    },
  });

  const submitted = await adapter.musicClient.submitGeneration({
    baseUrl,
    apiKey: 'one-time-key',
    options: { prompt: 'A velvet jazz quartet', lyrics: '', audioFormat: 'mp3' },
  });
  const polled = await adapter.musicClient.queryTasks({ baseUrl, apiKey: 'one-time-key', taskIds: ['wp-task-7'] });

  assert.deepEqual(submitted, { taskId: 'wp-task-7', status: 'queued', queuePosition: 0 });
  assert.equal(requests[0].url, 'https://cms.example.test/wp-json/acemusic/v1/music/generate');
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    prompt: 'A velvet jazz quartet', lyrics: '', thinking: true, vocal_language: 'en', audio_format: 'mp3',
    task_type: 'text2music', use_random_seed: true, baseUrl, apiKey: 'one-time-key',
  });
  assert.equal(requests[1].url, 'https://cms.example.test/wp-json/acemusic/v1/music/query');
  assert.deepEqual(JSON.parse(requests[1].options.body), { task_id_list: ['wp-task-7'], baseUrl, apiKey: 'one-time-key' });
  assert.deepEqual(polled, [{ taskId: 'wp-task-7', status: 'succeeded', outputs: [{ path: '/tmp/wp-track.mp3', metadata: {} }], error: '' }]);
});

test('reference-audio upload remains multipart and the proxy includes an explicit expected-file marker', async () => {
  let request;
  const file = new Blob([Uint8Array.from([1, 2, 3])], { type: 'audio/mpeg' });
  Object.defineProperty(file, 'name', { value: 'reference.mp3' });
  const adapter = createWordPressAdapter(makeRoot(), {
    locationRef,
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return jsonResponse({ code: 200, data: { task_id: 'wp-reference-1', status: 'queued' }, error: null });
    },
  });

  await adapter.musicClient.submitGeneration({ baseUrl, options: { prompt: 'Match this reference style' }, referenceAudio: file });
  assert.equal(request.url, 'https://cms.example.test/wp-json/acemusic/v1/music/generate');
  assert.equal(request.options.headers['X-WP-Nonce'], 'nonce-music');
  assert.equal(request.options.headers['Content-Type'], undefined);
  assert.equal(request.options.body.get('reference_audio').name, 'reference.mp3');
  assert.equal(request.options.body.get('baseUrl'), baseUrl);
  assert.equal(request.options.body.get('acemusic_reference_audio_expected'), '1');
  assert.equal(request.options.body.get('apiKey'), '');
});

test('audio downloads stay on the same-origin protected proxy and never put the API key in a URL', async () => {
  let request;
  const audioBytes = Uint8Array.from([1, 4, 9, 16]);
  const adapter = createWordPressAdapter(makeRoot(), {
    locationRef,
    fetchImpl: async (url, options) => {
      request = { url: new URL(String(url)), options };
      return new Response(audioBytes, {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg', 'X-AceMusic-Upstream-Response': '1' },
      });
    },
  });

  const audio = await adapter.musicClient.fetchAudio({ baseUrl, apiKey: 'hidden-api-key', path: '/srv/generated/music.mp3' });
  assert.equal(request.url.origin, locationRef.origin);
  assert.equal(request.url.pathname, '/wp-json/acemusic/v1/music/audio');
  assert.equal(request.url.searchParams.get('baseUrl'), baseUrl);
  assert.equal(request.url.searchParams.get('path'), '/srv/generated/music.mp3');
  assert.equal(request.url.href.includes('hidden-api-key'), false);
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.headers['X-WP-Nonce'], 'nonce-music');
  assert.equal(request.options.headers.Authorization, 'Bearer hidden-api-key');
  assert.deepEqual([...audio.bytes], [...audioBytes]);
  assert.equal(audio.contentType, 'audio/mpeg');
});
