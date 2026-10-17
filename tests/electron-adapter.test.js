import assert from 'node:assert/strict';
import test from 'node:test';
import { createElectronAdapter, ElectronBridgeError } from '../src/adapters/electron/createElectronAdapter.js';

function memoryStorage() {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
    entries,
  };
}

test('Electron adapter reuses public settings and branding storage without persisting credentials', async () => {
  const storage = memoryStorage();
  const calls = [];
  const bridge = {
    credentials: {
      hasApiKey: async () => true,
      setApiKey: async (value) => { calls.push(['save', value]); },
      clearApiKey: async () => { calls.push(['clear']); },
    },
    api: {
      testConnection: async (value) => { calls.push(['test', value]); return { ok: true }; },
      listModels: async (value) => { calls.push(['models', value]); return { models: [], defaultModel: null }; },
      submitGeneration: async (value) => { calls.push(['generate', value]); return { taskId: 'electron-task', status: 'queued', queuePosition: null }; },
      queryTasks: async (value) => { calls.push(['query', value]); return []; },
      fetchAudio: async (value) => { calls.push(['audio', value]); return { bytes: new Uint8Array([1]), contentType: 'audio/mpeg', filename: 'track.mp3' }; },
    },
  };
  const adapter = createElectronAdapter({ bridge, storage, indexedDBRef: null });

  await adapter.settingsStore.savePublicSettings({ apiBaseUrl: 'https://api.example.test/' });
  await adapter.settingsStore.saveBranding({ theme: { accent: '#123456' } });
  await adapter.credentialStore.setApiKey('user-entered-key');
  const apiResult = await adapter.apiClient.testConnection({ baseUrl: 'https://api.example.test', apiKey: '' });
  const modelResult = await adapter.musicClient.listModels({ baseUrl: 'https://api.example.test', apiKey: '' });
  const reference = new Blob([Uint8Array.from([7, 8])], { type: 'audio/mpeg' });
  Object.defineProperty(reference, 'name', { value: 'reference.mp3' });
  const generationResult = await adapter.musicClient.submitGeneration({
    baseUrl: 'https://api.example.test', apiKey: '', options: { prompt: 'Create a real track' }, referenceAudio: reference,
  });
  const queryResult = await adapter.musicClient.queryTasks({ baseUrl: 'https://api.example.test', apiKey: '', taskIds: ['electron-task'] });
  const audioResult = await adapter.musicClient.fetchAudio({ baseUrl: 'https://api.example.test', apiKey: '', path: '/tmp/track.mp3' });

  assert.deepEqual(await adapter.settingsStore.loadPublicSettings(), { apiBaseUrl: 'https://api.example.test' });
  assert.equal((await adapter.settingsStore.loadBranding()).theme.accent, '#123456');
  assert.equal(await adapter.credentialStore.hasApiKey(), true);
  assert.equal(await adapter.credentialStore.getApiKey(), '');
  assert.deepEqual(apiResult, { ok: true });
  assert.deepEqual(modelResult, { models: [], defaultModel: null });
  assert.deepEqual(generationResult, { taskId: 'electron-task', status: 'queued', queuePosition: null });
  assert.deepEqual(queryResult, []);
  assert.deepEqual([...audioResult.bytes], [1]);
  assert.equal(JSON.stringify([...storage.entries]).includes('user-entered-key'), false);
  assert.equal(adapter.deployment.target, 'electron');
  assert.deepEqual(calls.slice(0, 3), [
    ['save', 'user-entered-key'],
    ['test', { baseUrl: 'https://api.example.test', apiKey: '' }],
    ['models', { baseUrl: 'https://api.example.test', apiKey: '' }],
  ]);
  assert.deepEqual(calls[3][1], {
    baseUrl: 'https://api.example.test', apiKey: '', options: { prompt: 'Create a real track' },
    referenceAudio: { name: 'reference.mp3', type: 'audio/mpeg', bytes: new Uint8Array([7, 8]) },
  });
  assert.deepEqual(calls.slice(4), [
    ['query', { baseUrl: 'https://api.example.test', apiKey: '', taskIds: ['electron-task'] }],
    ['audio', { baseUrl: 'https://api.example.test', apiKey: '', path: '/tmp/track.mp3' }],
  ]);
});

test('Electron adapter rejects a missing or incomplete privileged bridge', () => {
  assert.throws(() => createElectronAdapter({ bridge: null }), ElectronBridgeError);
  assert.throws(() => createElectronAdapter({ bridge: { credentials: {}, api: {} } }), ElectronBridgeError);
});
