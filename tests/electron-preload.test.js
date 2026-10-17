import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const preloadSource = await readFile(resolve(projectRoot, 'electron/preload.cjs'), 'utf8');

function loadPreload(invokeImpl) {
  let exposed;
  const contextBridge = { exposeInMainWorld: (name, value) => { exposed = { name, value }; } };
  const ipcRenderer = { invoke: invokeImpl };
  runInNewContext(preloadSource, {
    require: (moduleName) => {
      assert.equal(moduleName, 'electron');
      return { contextBridge, ipcRenderer };
    },
  });
  return exposed;
}

test('preload exposes only fixed credential, health, model, generation, query, and audio methods', async () => {
  const channels = [];
  const exposed = loadPreload(async (channel, payload) => {
    channels.push([channel, payload]);
    const value = channel.endsWith('has-api-key') ? { hasApiKey: true } : { saved: true };
    return { __acemusicDesktopIpc: true, ok: true, value };
  });
  assert.equal(exposed.name, 'acemusicDesktop');
  assert.deepEqual(Object.keys(exposed.value).sort(), ['api', 'credentials']);
  assert.deepEqual(Object.keys(exposed.value.credentials).sort(), ['clearApiKey', 'hasApiKey', 'setApiKey']);
  assert.deepEqual(Object.keys(exposed.value.api).sort(), ['fetchAudio', 'listModels', 'queryTasks', 'submitGeneration', 'testConnection']);
  assert.equal('ipcRenderer' in exposed.value, false);
  assert.equal('require' in exposed.value, false);
  assert.equal(await exposed.value.credentials.hasApiKey(), true);
  await exposed.value.credentials.setApiKey('entered-key');
  await exposed.value.api.listModels({ baseUrl: 'https://api.example.test' });
  await exposed.value.api.submitGeneration({ baseUrl: 'https://api.example.test', options: { prompt: 'A track' } });
  await exposed.value.api.queryTasks({ baseUrl: 'https://api.example.test', taskIds: ['task-1'] });
  await exposed.value.api.fetchAudio({ baseUrl: 'https://api.example.test', path: '/tmp/a.mp3' });
  assert.deepEqual(JSON.parse(JSON.stringify(channels)), [
    ['acemusic:credentials:has-api-key', null],
    ['acemusic:credentials:save-api-key', { apiKey: 'entered-key' }],
    ['acemusic:api:list-models', { baseUrl: 'https://api.example.test' }],
    ['acemusic:api:submit-generation', { baseUrl: 'https://api.example.test', options: { prompt: 'A track' } }],
    ['acemusic:api:query-tasks', { baseUrl: 'https://api.example.test', taskIds: ['task-1'] }],
    ['acemusic:api:fetch-audio', { baseUrl: 'https://api.example.test', path: '/tmp/a.mp3' }],
  ]);
});

test('preload converts safe IPC errors without leaking stacks', async () => {
  const exposed = loadPreload(async () => ({
    __acemusicDesktopIpc: true,
    ok: false,
    error: { message: 'Secure storage unavailable.', code: 'CREDENTIAL_STORAGE_UNAVAILABLE' },
  }));
  await assert.rejects(exposed.value.credentials.clearApiKey(), (error) => {
    assert.equal(error.message, 'Secure storage unavailable.');
    assert.equal(error.code, 'CREDENTIAL_STORAGE_UNAVAILABLE');
    assert.equal('stack' in error, true); // newly created renderer-local Error only
    return true;
  });
});
