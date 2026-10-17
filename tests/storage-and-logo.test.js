import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserSettingsStore } from '../src/adapters/standalone/BrowserSettingsStore.js';
import { MemoryCredentialStore } from '../src/core/storage/MemoryCredentialStore.js';
import { MAX_LOGO_BYTES, DEFAULT_API_BASE_URL } from '../src/core/config/defaults.js';
import { LogoValidationError, validateLogoFile } from '../src/core/config/logoValidation.js';

function createStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function pngBlob() {
  return new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])], { type: 'image/png' });
}

test('browser store persists public API URL and theme, but never accepts a credential field', async () => {
  const storage = createStorage();
  const store = new BrowserSettingsStore({ storage, indexedDBRef: null });
  await store.savePublicSettings({ apiBaseUrl: 'https://api.example.test', apiKey: 'secret-key' });
  await store.saveBranding({ theme: { accent: '#abc', injected: 'bad' } });

  assert.deepEqual(await store.loadPublicSettings(), { apiBaseUrl: 'https://api.example.test' });
  assert.equal((await store.loadBranding()).theme.accent, '#AABBCC');
  assert.equal([...storage.values.values()].some((value) => value.includes('secret-key')), false);
  assert.equal([...storage.values.keys()].some((key) => key.toLowerCase().includes('credential')), false);
});

test('music history stores only bounded local task metadata and never stores credential fields', async () => {
  const storage = createStorage();
  const store = new BrowserSettingsStore({ storage, indexedDBRef: null });
  const records = await store.saveMusicHistory([{
    taskId: 'task-1',
    baseUrl: 'https://api.example.test/',
    prompt: 'Midnight synthwave',
    createdAt: '2026-01-02T03:04:05.000Z',
    status: 'succeeded',
    queuePosition: 0,
    outputs: [{ path: '/tmp/generated.mp3', metadata: { model: 'acestep-v15', bpm: 108, ignored: 'nope' } }],
    apiKey: 'do-not-store',
  }]);
  assert.deepEqual(records, [{
    taskId: 'task-1',
    baseUrl: 'https://api.example.test',
    prompt: 'Midnight synthwave',
    createdAt: '2026-01-02T03:04:05.000Z',
    status: 'succeeded',
    queuePosition: 0,
    outputs: [{ path: '/tmp/generated.mp3', metadata: { model: 'acestep-v15', bpm: 108 } }],
    error: '',
  }]);
  assert.deepEqual(await store.loadMusicHistory(), records);
  assert.equal([...storage.values.values()].some((value) => value.includes('do-not-store')), false);
});

test('browser store falls back to local storage for logo blobs and can reset them', async () => {
  const storage = createStorage();
  const store = new BrowserSettingsStore({ storage, indexedDBRef: null });
  const original = pngBlob();
  await store.saveLogo(original);
  const restored = await store.loadLogo();

  assert.equal(restored.type, 'image/png');
  assert.deepEqual(new Uint8Array(await restored.arrayBuffer()), new Uint8Array(await original.arrayBuffer()));
  await store.saveLogo(null);
  assert.equal(await store.loadLogo(), null);
});

test('corrupt browser settings recover to defaults instead of poisoning initialization', async () => {
  const storage = createStorage();
  storage.setItem('acemusic.shared-core.public.v1', '{ broken json');
  storage.setItem('acemusic.shared-core.branding.v1', JSON.stringify({ theme: { accent: 'not-a-color' } }));
  const store = new BrowserSettingsStore({ storage, indexedDBRef: null });
  assert.deepEqual(await store.loadPublicSettings(), { apiBaseUrl: DEFAULT_API_BASE_URL });
  assert.notEqual((await store.loadBranding()).theme.accent, 'not-a-color');
});

test('memory credential store is separate from browser settings storage', async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.setApiKey('session-secret');
  assert.equal(await credentials.getApiKey(), 'session-secret');
  assert.equal(await credentials.hasApiKey(), true);
  await credentials.clearApiKey();
  assert.equal(await credentials.getApiKey(), '');
  assert.equal(await credentials.hasApiKey(), false);
});

test('logo validation accepts PNG and JPG signatures and enforces the maximum size', async () => {
  const png = pngBlob();
  const jpeg = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
  assert.equal(await validateLogoFile(png), png);
  assert.equal(await validateLogoFile(jpeg), jpeg);

  const oversized = {
    type: 'image/png',
    size: MAX_LOGO_BYTES + 1,
    arrayBuffer: async () => new ArrayBuffer(0),
    slice: () => new Blob([]),
  };
  await assert.rejects(validateLogoFile(oversized), (error) => error instanceof LogoValidationError && error.code === 'FILE_TOO_LARGE');
});

test('logo validation rejects unsupported MIME types and mismatched file signatures', async () => {
  await assert.rejects(
    validateLogoFile(new Blob(['GIF89a'], { type: 'image/gif' })),
    (error) => error.code === 'UNSUPPORTED_TYPE',
  );
  await assert.rejects(
    validateLogoFile(new Blob(['not a png'], { type: 'image/png' })),
    (error) => error.code === 'TYPE_MISMATCH',
  );
});
