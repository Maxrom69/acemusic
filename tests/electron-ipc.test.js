import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import {
  IPC_CHANNELS,
  validateApiTestPayload,
  validateAudioFetchPayload,
  validateCredentialPayload,
  validateGenerationPayload,
  validateModelsPayload,
  validateNoIpcPayload,
  validateTaskQueryPayload,
} from '../electron/ipc-contract.js';
import { isTrustedMainFrame, registerIpcHandlers } from '../electron/ipc.js';

const rendererFile = '/application/dist/electron-web/index.html';

function createIpcHarness() {
  const handlers = new Map();
  const calls = { saved: [], tested: [], models: [], generated: [], queried: [], audio: [], cleared: 0, hasApiKey: 0 };
  const webContents = { mainFrame: { url: pathToFileURL(rendererFile).toString() } };
  const mainWindow = { webContents };
  const ipcMain = {
    handle: (channel, listener) => handlers.set(channel, listener),
    removeHandler: (channel) => handlers.delete(channel),
  };
  const credentialStore = {
    hasApiKey: async () => { calls.hasApiKey += 1; return true; },
    setApiKey: async (apiKey) => { calls.saved.push(apiKey); },
    clearApiKey: async () => { calls.cleared += 1; },
  };
  const apiClient = {
    testConnection: async (options) => { calls.tested.push(options); return { ok: true, service: 'ACE-Step API' }; },
    listModels: async (options) => { calls.models.push(options); return { models: [], defaultModel: null }; },
    submitGeneration: async (options) => { calls.generated.push(options); return { taskId: 'ipc-task-1', status: 'queued', queuePosition: null }; },
    queryTasks: async (options) => { calls.queried.push(options); return []; },
    fetchAudio: async (options) => { calls.audio.push(options); return { bytes: new Uint8Array([1, 2]), contentType: 'audio/mpeg', filename: 'track.mp3' }; },
  };
  const removeHandlers = registerIpcHandlers({ ipcMain, mainWindow, credentialStore, apiClient, rendererFile });
  return {
    handlers, calls, mainWindow, webContents, removeHandlers,
    event: { sender: webContents, senderFrame: webContents.mainFrame },
  };
}

test('IPC schemas accept only expected fields and reject broad operations', () => {
  assert.deepEqual(validateCredentialPayload({ apiKey: '  sample-key  ' }), { apiKey: 'sample-key' });
  assert.throws(() => validateCredentialPayload({ apiKey: 'secret', filePath: '/tmp/key' }), /unsupported field/);
  assert.deepEqual(validateApiTestPayload({ baseUrl: 'https://api.example.test/', apiKey: '' }), {
    baseUrl: 'https://api.example.test', apiKey: '',
  });
  assert.throws(() => validateApiTestPayload({ baseUrl: 'https://api.example.test', apiKey: '', command: 'whoami' }), /unsupported field/);
  assert.throws(() => validateNoIpcPayload({}), /does not accept a payload/);
  assert.deepEqual(validateModelsPayload({ baseUrl: 'https://api.example.test' }), { baseUrl: 'https://api.example.test', apiKey: '' });
  assert.deepEqual(validateGenerationPayload({ baseUrl: 'https://api.example.test', options: { prompt: 'A real request', lyrics: '' } }).options, { prompt: 'A real request', lyrics: '' });
  assert.deepEqual(validateTaskQueryPayload({ baseUrl: 'https://api.example.test', taskIds: ['task-1'] }).taskIds, ['task-1']);
  assert.deepEqual(validateAudioFetchPayload({ baseUrl: 'https://api.example.test', path: '/tmp/song.mp3' }).path, '/tmp/song.mp3');
  assert.throws(() => validateGenerationPayload({ baseUrl: 'https://api.example.test', options: { prompt: 'x', command: 'rm -rf' } }), /unsupported field/);
});

test('IPC handlers expose narrow credential, health, model, generation, status, and audio operations', async () => {
  const harness = createIpcHarness();
  assert.deepEqual([...harness.handlers.keys()].sort(), Object.values(IPC_CHANNELS).sort());

  const status = await harness.handlers.get(IPC_CHANNELS.HAS_API_KEY)(harness.event, undefined);
  assert.deepEqual(status, { __acemusicDesktopIpc: true, ok: true, value: { hasApiKey: true } });
  assert.equal(JSON.stringify(status).includes('secret'), false);

  const saved = await harness.handlers.get(IPC_CHANNELS.SAVE_API_KEY)(harness.event, { apiKey: 'entered-key' });
  assert.deepEqual(saved, { __acemusicDesktopIpc: true, ok: true, value: { saved: true } });
  assert.deepEqual(harness.calls.saved, ['entered-key']);
  assert.equal(JSON.stringify(saved).includes('entered-key'), false);

  const testResult = await harness.handlers.get(IPC_CHANNELS.TEST_API_CONNECTION)(harness.event, {
    baseUrl: 'https://api.example.test', apiKey: '',
  });
  assert.deepEqual(testResult, {
    __acemusicDesktopIpc: true, ok: true, value: { ok: true, service: 'ACE-Step API' },
  });
  assert.deepEqual(harness.calls.tested, [{ baseUrl: 'https://api.example.test', apiKey: '' }]);

  const models = await harness.handlers.get(IPC_CHANNELS.LIST_MODELS)(harness.event, { baseUrl: 'https://api.example.test' });
  assert.deepEqual(models.value, { models: [], defaultModel: null });
  assert.deepEqual(harness.calls.models, [{ baseUrl: 'https://api.example.test', apiKey: '' }]);

  const generated = await harness.handlers.get(IPC_CHANNELS.SUBMIT_GENERATION)(harness.event, {
    baseUrl: 'https://api.example.test', options: { prompt: 'Create a real track', lyrics: '' },
  });
  assert.deepEqual(generated.value, { taskId: 'ipc-task-1', status: 'queued', queuePosition: null });
  assert.equal(harness.calls.generated.length, 1);

  const queried = await harness.handlers.get(IPC_CHANNELS.QUERY_TASKS)(harness.event, {
    baseUrl: 'https://api.example.test', taskIds: ['ipc-task-1'],
  });
  assert.deepEqual(queried.value, []);
  assert.deepEqual(harness.calls.queried, [{ baseUrl: 'https://api.example.test', apiKey: '', taskIds: ['ipc-task-1'] }]);

  const audio = await harness.handlers.get(IPC_CHANNELS.FETCH_AUDIO)(harness.event, {
    baseUrl: 'https://api.example.test', path: '/tmp/track.mp3',
  });
  assert.deepEqual([...audio.value.bytes], [1, 2]);
  assert.equal(harness.calls.audio.length, 1);

  const removed = await harness.handlers.get(IPC_CHANNELS.CLEAR_API_KEY)(harness.event, undefined);
  assert.deepEqual(removed, { __acemusicDesktopIpc: true, ok: true, value: { cleared: true } });
  assert.equal(harness.calls.cleared, 1);
  harness.removeHandlers();
  assert.equal(harness.handlers.size, 0);
});

test('untrusted renderer frames and malformed requests are refused without side effects', async () => {
  const harness = createIpcHarness();
  const save = harness.handlers.get(IPC_CHANNELS.SAVE_API_KEY);
  const untrusted = await save({ sender: {}, senderFrame: { url: pathToFileURL(rendererFile).toString() } }, { apiKey: 'never-save' });
  assert.equal(untrusted.ok, false);
  assert.equal(untrusted.error.code, 'UNTRUSTED_RENDERER');
  assert.deepEqual(harness.calls.saved, []);

  const malformed = await save(harness.event, { apiKey: 'key', extra: true });
  assert.equal(malformed.ok, false);
  assert.match(malformed.error.message, /unsupported field/);
  assert.equal('stack' in malformed.error, false);
  assert.deepEqual(harness.calls.saved, []);
});

test('trusted renderer checks require the top-level app URL and loopback-only development origin', () => {
  const webContents = { mainFrame: { url: pathToFileURL(rendererFile).toString() } };
  const mainWindow = { webContents };
  assert.equal(isTrustedMainFrame({ sender: webContents, senderFrame: webContents.mainFrame }, mainWindow, { rendererFile }), true);
  assert.equal(isTrustedMainFrame({ sender: webContents, senderFrame: { url: 'https://attacker.example/' } }, mainWindow, { rendererFile }), false);

  const developmentFrame = { url: 'http://127.0.0.1:4173/' };
  assert.equal(isTrustedMainFrame(
    { sender: webContents, senderFrame: developmentFrame },
    mainWindow,
    { developmentUrl: 'http://127.0.0.1:4173' },
  ), false);
  const developmentWindow = { webContents: { ...webContents, mainFrame: developmentFrame } };
  assert.equal(isTrustedMainFrame(
    { sender: developmentWindow.webContents, senderFrame: developmentFrame },
    developmentWindow,
    { developmentUrl: 'http://127.0.0.1:4173' },
  ), true);
  assert.equal(isTrustedMainFrame(
    { sender: developmentWindow.webContents, senderFrame: { url: 'http://evil.example:4173/' } },
    developmentWindow,
    { developmentUrl: 'http://127.0.0.1:4173' },
  ), false);
});
