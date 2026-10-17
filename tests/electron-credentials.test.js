import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SecureCredentialStore } from '../electron/secure-credential-store.js';

function fakeSafeStorage({ available = true, backend = 'gnome_libsecret' } = {}) {
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => backend,
    encryptString: (value) => Buffer.from(`test-cipher:${value}`, 'utf8'),
    decryptString: (value) => {
      const encoded = value.toString('utf8');
      if (!encoded.startsWith('test-cipher:')) throw new Error('Bad test ciphertext');
      return encoded.slice('test-cipher:'.length);
    },
  };
}

async function withStore(options, callback) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'acemusic-credential-test-'));
  try {
    const store = new SecureCredentialStore({ userDataPath, ...options });
    await callback({ store, userDataPath });
  } finally {
    await rm(userDataPath, { recursive: true, force: true });
  }
}

test('desktop credentials are encrypted, replaceable, status-only, and removable', async () => {
  await withStore({ safeStorage: fakeSafeStorage(), platform: 'linux' }, async ({ store, userDataPath }) => {
    assert.equal(await store.hasApiKey(), false);
    await store.setApiKey('  top-secret-value  ');
    assert.equal(await store.hasApiKey(), true);
    const stored = await readFile(join(userDataPath, 'api-credential.enc'), 'utf8');
    assert.match(stored, /^v1:[A-Za-z0-9+/]+=*$/);
    assert.equal(stored.includes('top-secret-value'), false);
    assert.equal(await store.getApiKeyForRequest(), 'top-secret-value');

    await store.setApiKey('rotated-secret');
    assert.equal(await store.getApiKeyForRequest(), 'rotated-secret');
    await store.clearApiKey();
    assert.equal(await store.hasApiKey(), false);
    assert.equal(await store.getApiKeyForRequest(), '');
  });
});

test('desktop credential storage refuses unavailable encryption and Linux basic_text fallback', async () => {
  await withStore({ safeStorage: fakeSafeStorage({ available: false }), platform: 'win32' }, async ({ store }) => {
    await assert.rejects(store.setApiKey('not-saved'), { code: 'CREDENTIAL_STORAGE_UNAVAILABLE' });
    assert.equal(await store.hasApiKey(), false);
  });
  await withStore({ safeStorage: fakeSafeStorage({ backend: 'basic_text' }), platform: 'linux' }, async ({ store }) => {
    await assert.rejects(store.setApiKey('not-saved'), { code: 'CREDENTIAL_STORAGE_UNAVAILABLE' });
    assert.equal(await store.hasApiKey(), false);
  });
});

test('desktop credential store validates keys and detects corrupt records', async () => {
  await withStore({ safeStorage: fakeSafeStorage(), platform: 'linux' }, async ({ store, userDataPath }) => {
    await assert.rejects(store.setApiKey('   '), { code: 'INVALID_API_KEY' });
    await writeFile(join(userDataPath, 'api-credential.enc'), 'plain-api-key', 'utf8');
    assert.equal(await store.hasApiKey(), true);
    await assert.rejects(store.getApiKeyForRequest(), { code: 'CREDENTIAL_DECRYPTION_FAILED' });
  });
});
