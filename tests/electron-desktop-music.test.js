import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesktopApiClient } from '../electron/desktop-api.js';

const baseUrl = 'https://api.example.test';

function json(data) {
  return new Response(JSON.stringify({ code: 200, data, error: null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('desktop main-process client resolves OS-backed credentials for models, generation, tasks, and audio', async () => {
  let savedKeyReads = 0;
  const requests = [];
  const client = createDesktopApiClient({
    credentialStore: { getApiKeyForRequest: async () => { savedKeyReads += 1; return 'os-stored-key'; } },
    fetchImpl: async (url, options) => {
      const request = { url: String(url), options };
      requests.push(request);
      if (request.url.endsWith('/v1/models')) return json({ models: [{ name: 'acestep-v15', is_default: true }], default_model: 'acestep-v15' });
      if (request.url.endsWith('/release_task')) return json({ task_id: 'desktop-task', status: 'queued', queue_position: 1 });
      if (request.url.endsWith('/query_result')) return json([{ task_id: 'desktop-task', status: 0, result: '' }]);
      if (request.url.includes('/v1/audio?')) return new Response(Uint8Array.from([1, 3, 5]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
      throw new Error('Unexpected endpoint');
    },
  });

  const models = await client.listModels({ baseUrl });
  const task = await client.submitGeneration({ baseUrl, options: { prompt: 'A generated track', lyrics: '' } });
  const statuses = await client.queryTasks({ baseUrl, taskIds: ['desktop-task'] });
  const audio = await client.fetchAudio({ baseUrl, path: '/private/generated.mp3' });

  assert.deepEqual(models, { models: [{ name: 'acestep-v15', isDefault: true }], defaultModel: 'acestep-v15' });
  assert.deepEqual(task, { taskId: 'desktop-task', status: 'queued', queuePosition: 1 });
  assert.deepEqual(statuses, [{ taskId: 'desktop-task', status: 'running', outputs: [], error: '' }]);
  assert.deepEqual([...audio.bytes], [1, 3, 5]);
  assert.equal(savedKeyReads, 4);
  assert.ok(requests.every((request) => request.options.headers.Authorization === 'Bearer os-stored-key'));
  assert.equal(JSON.stringify({ models, task, statuses, audio: { contentType: audio.contentType } }).includes('os-stored-key'), false);
});

test('typed Electron API credentials are used transiently by the main process and are not returned', async () => {
  let savedKeyReads = 0;
  let request;
  const client = createDesktopApiClient({
    credentialStore: { getApiKeyForRequest: async () => { savedKeyReads += 1; return 'saved-key'; } },
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return json({ models: [], default_model: null });
    },
  });
  const result = await client.listModels({ baseUrl, apiKey: 'one-time-key' });
  assert.equal(savedKeyReads, 0);
  assert.equal(request.options.headers.Authorization, 'Bearer one-time-key');
  assert.deepEqual(result, { models: [], defaultModel: null });
  assert.equal(JSON.stringify(result).includes('one-time-key'), false);
});
