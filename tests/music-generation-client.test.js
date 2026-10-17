import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiConnectionError } from '../src/core/api/aceStepClient.js';
import {
  createMusicGenerationClient,
  MAX_AUDIO_DOWNLOAD_BYTES,
  MAX_REFERENCE_AUDIO_BYTES,
  normalizeGenerationOptions,
} from '../src/core/api/musicGenerationClient.js';

function jsonResponse(data, { status = 200, code = 200, error = null, headers = {} } = {}) {
  return new Response(JSON.stringify({ code, data, error }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const baseUrl = 'https://api.example.test/custom-prefix';

test('loads only model names reported by GET /v1/models and identifies the API default', async () => {
  let request;
  const client = createMusicGenerationClient({
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return jsonResponse({
        models: [{ name: 'acestep-v15', is_default: true }, { name: 'acestep-v15-base', is_default: false }],
        default_model: 'acestep-v15',
      });
    },
  });

  const result = await client.listModels({ baseUrl, apiKey: 'test-key' });
  assert.equal(request.url, `${baseUrl}/v1/models`);
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.deepEqual(result, {
    models: [{ name: 'acestep-v15', isDefault: true }, { name: 'acestep-v15-base', isDefault: false }],
    defaultModel: 'acestep-v15',
  });
});

test('submits the documented generation fields to POST /release_task and requires a real task ID', async () => {
  let request;
  const client = createMusicGenerationClient({
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return jsonResponse({ task_id: 'task-2026-001', status: 'queued', queue_position: 2 });
    },
  });

  const result = await client.submitGeneration({
    baseUrl,
    apiKey: 'test-key',
    options: {
      prompt: 'Dreamy synth-pop with warm bass',
      lyrics: 'A sky of violet light',
      thinking: true,
      audioFormat: 'mp3',
      audioDuration: 42,
      bpm: 112,
      keyScale: 'F# minor',
      timeSignature: '4/4',
      inferenceSteps: 28,
      guidanceScale: 4.5,
      model: 'acestep-v15',
      useFormat: true,
    },
  });

  assert.equal(request.url, `${baseUrl}/release_task`);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.options.body), {
    prompt: 'Dreamy synth-pop with warm bass',
    lyrics: 'A sky of violet light',
    thinking: true,
    vocal_language: 'en',
    audio_format: 'mp3',
    task_type: 'text2music',
    use_random_seed: true,
    model: 'acestep-v15',
    audio_duration: 42,
    bpm: 112,
    inference_steps: 28,
    guidance_scale: 4.5,
    time_signature: '4/4',
    key_scale: 'F# minor',
    use_format: true,
  });
  assert.deepEqual(result, { taskId: 'task-2026-001', status: 'queued', queuePosition: 2 });
});

test('uploads optional reference audio using the documented multipart field', async () => {
  let request;
  const referenceAudio = new Blob([Uint8Array.from([1, 2, 3])], { type: 'audio/mpeg' });
  Object.defineProperty(referenceAudio, 'name', { value: 'reference.mp3' });
  const client = createMusicGenerationClient({
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return jsonResponse({ task_id: 'task-ref-1', status: 'queued' });
    },
  });

  await client.submitGeneration({
    baseUrl,
    options: { prompt: 'Soft piano and strings', lyrics: '', audioFormat: 'wav' },
    referenceAudio,
  });
  assert.equal(request.url, `${baseUrl}/release_task`);
  assert.equal(request.options.headers['Content-Type'], undefined);
  assert.equal(request.options.body.get('reference_audio').name, 'reference.mp3');
  assert.equal(request.options.body.get('prompt'), 'Soft piano and strings');
  assert.equal(request.options.body.get('task_type'), 'text2music');
  assert.match(request.options.body.get('thinking'), /true/);
});

test('sends instrumental requests with empty lyrics and enforces documented option bounds', async () => {
  const normalized = normalizeGenerationOptions({ prompt: 'ambient instrumental', lyrics: '', seed: 12 });
  assert.equal(normalized.lyrics, '');
  assert.equal(normalized.seed, 12);
  assert.equal(normalized.use_random_seed, false);
  assert.throws(() => normalizeGenerationOptions({ prompt: 'x', audioDuration: 9 }), { code: 'INVALID_GENERATION_OPTIONS' });
  assert.throws(() => normalizeGenerationOptions({ prompt: 'x', bpm: 301 }), { code: 'INVALID_GENERATION_OPTIONS' });
  assert.throws(() => normalizeGenerationOptions({ prompt: 'x', model: 'invalid/model' }), { code: 'INVALID_GENERATION_OPTIONS' });
  assert.throws(() => normalizeGenerationOptions({ prompt: '' }), { code: 'INVALID_GENERATION_OPTIONS' });
});

test('queries actual task statuses and safely parses returned file paths', async () => {
  let request;
  const client = createMusicGenerationClient({
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return jsonResponse([
        {
          task_id: 'task-ok',
          status: 1,
          result: JSON.stringify([{ file: 'https://127.0.0.1:8001/v1/audio?path=%2Ftmp%2Fgenerated%2Fsong.mp3', metas: { bpm: 96, model: 'acestep-v15' } }]),
        },
        { task_id: 'task-running', status: 0, result: '' },
        { task_id: 'task-failed', status: 2, error: 'private error details' },
        { task_id: 'not-requested', status: 1, result: '[]' },
      ]);
    },
  });
  const results = await client.queryTasks({ baseUrl, taskIds: ['task-ok', 'task-running', 'task-failed'] });
  assert.equal(request.url, `${baseUrl}/query_result`);
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), { task_id_list: ['task-ok', 'task-running', 'task-failed'] });
  assert.deepEqual(results, [
    { taskId: 'task-ok', status: 'succeeded', outputs: [{ path: '/tmp/generated/song.mp3', metadata: { model: 'acestep-v15', bpm: 96 } }], error: '' },
    { taskId: 'task-running', status: 'running', outputs: [], error: '' },
    { taskId: 'task-failed', status: 'failed', outputs: [], error: 'The API reported that this generation failed.' },
  ]);
});

test('never fetches the host returned in a result file URL and omits paths containing the API key', async () => {
  const client = createMusicGenerationClient({
    fetchImpl: async () => jsonResponse([
      { task_id: 'task-1', status: 1, result: JSON.stringify([{ file: 'https://attacker.example/v1/audio?path=%2Ftmp%2Fa.mp3' }]) },
      { task_id: 'task-2', status: 1, result: JSON.stringify([{ file: 'https://api.example.test/v1/audio?path=secret-key.mp3' }]) },
    ]),
  });
  const results = await client.queryTasks({ baseUrl, apiKey: 'secret-key', taskIds: ['task-1', 'task-2'] });
  assert.equal(results[0].outputs[0].path, '/tmp/a.mp3');
  assert.equal(results[1].outputs.length, 0);
});

test('downloads audio bytes through GET /v1/audio with the API path in the query', async () => {
  let request;
  const bytes = Uint8Array.from([73, 68, 51, 4, 5]);
  const client = createMusicGenerationClient({
    fetchImpl: async (url, options) => {
      request = { url: new URL(String(url)), options };
      return new Response(bytes, { status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(bytes.length) } });
    },
  });
  const audio = await client.fetchAudio({ baseUrl, apiKey: 'test-key', path: '/tmp/song.mp3' });
  assert.equal(request.url.pathname, '/custom-prefix/v1/audio');
  assert.equal(request.url.searchParams.get('path'), '/tmp/song.mp3');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.deepEqual([...audio.bytes], [...bytes]);
  assert.equal(audio.contentType, 'audio/mpeg');
  assert.equal(audio.filename, 'song.mp3');
  assert.equal(MAX_AUDIO_DOWNLOAD_BYTES, 64 * 1024 * 1024);
  assert.equal(MAX_REFERENCE_AUDIO_BYTES, 25 * 1024 * 1024);
});

test('rejects missing task IDs, oversized reference files, and malformed API success responses', async () => {
  const noTaskId = createMusicGenerationClient({ fetchImpl: async () => jsonResponse({ status: 'queued' }) });
  await assert.rejects(noTaskId.submitGeneration({ baseUrl, options: { prompt: 'A real prompt' } }), { code: 'INVALID_RESPONSE' });

  const tooLarge = new Blob([new Uint8Array(1)]);
  Object.defineProperty(tooLarge, 'size', { value: MAX_REFERENCE_AUDIO_BYTES + 1 });
  Object.defineProperty(tooLarge, 'name', { value: 'too-large.mp3' });
  const client = createMusicGenerationClient({ fetchImpl: async () => assert.fail('Should not send invalid audio.') });
  await assert.rejects(client.submitGeneration({ baseUrl, options: { prompt: 'A real prompt' }, referenceAudio: tooLarge }), { code: 'INVALID_REFERENCE_AUDIO' });

  const malformed = createMusicGenerationClient({ fetchImpl: async () => jsonResponse({ models: [] }, { code: 503 }) });
  await assert.rejects(malformed.listModels({ baseUrl }), (error) => error instanceof ApiConnectionError && error.code === 'API_REJECTED');
});

test('timeouts remain bounded when a fetch implementation ignores AbortSignal', async () => {
  const client = createMusicGenerationClient({ fetchImpl: async () => new Promise(() => {}), timeouts: { models: 10 } });
  await assert.rejects(
    client.listModels({ baseUrl }),
    (error) => error instanceof ApiConnectionError && error.code === 'TIMEOUT',
  );
});
