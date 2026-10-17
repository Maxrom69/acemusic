import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeApiKey } from '../src/core/config/validation.js';

const CREDENTIAL_FILENAME = 'api-credential.enc';
const MAX_CIPHERTEXT_BYTES = 64 * 1024;
const MAX_STORED_CREDENTIAL_LENGTH = 3 + Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4;
const fileSystem = { mkdir, readFile, rename, rm, writeFile };

export class DesktopCredentialError extends Error {
  constructor(message, code = 'DESKTOP_CREDENTIAL_ERROR') {
    super(message);
    this.name = 'DesktopCredentialError';
    this.code = code;
  }
}

function isCiphertext(value) {
  if (typeof value !== 'string' || !value.startsWith('v1:')) return false;
  const encoded = value.slice(3);
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  const bytes = Buffer.from(encoded, 'base64');
  return bytes.length > 0 && bytes.length <= MAX_CIPHERTEXT_BYTES;
}

/**
 * Store an encrypted API key in the current user's application data directory.
 * Electron safeStorage uses Windows DPAPI or macOS Keychain; on Linux we require
 * libsecret/KWallet and refuse Electron's basic_text fallback.
 */
export class SecureCredentialStore {
  constructor({ safeStorage, userDataPath, platform = process.platform, fsOps = fileSystem }) {
    if (!safeStorage || typeof userDataPath !== 'string' || userDataPath.length === 0) {
      throw new TypeError('SecureCredentialStore requires safeStorage and a user data directory.');
    }
    this.safeStorage = safeStorage;
    this.userDataPath = userDataPath;
    this.platform = platform;
    this.fs = fsOps;
    this.credentialPath = join(userDataPath, CREDENTIAL_FILENAME);
  }

  async hasApiKey() {
    try {
      const stored = await this.fs.readFile(this.credentialPath, 'utf8');
      return typeof stored === 'string' && stored.trim().length > 0;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw new DesktopCredentialError('The saved API credential status could not be read.', 'CREDENTIAL_READ_FAILED');
    }
  }

  async setApiKey(value) {
    const apiKey = normalizeApiKey(value);
    if (!apiKey) {
      throw new DesktopCredentialError('Enter a non-empty API key before saving it.', 'INVALID_API_KEY');
    }
    this.assertSecureStorageAvailable();

    let encrypted;
    try {
      encrypted = this.safeStorage.encryptString(apiKey);
    } catch {
      throw new DesktopCredentialError('The operating system could not encrypt the API key.', 'CREDENTIAL_ENCRYPTION_FAILED');
    }
    if (!Buffer.isBuffer(encrypted) || encrypted.length === 0 || encrypted.length > MAX_CIPHERTEXT_BYTES) {
      throw new DesktopCredentialError('The operating system returned an invalid encrypted credential.', 'CREDENTIAL_ENCRYPTION_FAILED');
    }

    const stored = `v1:${encrypted.toString('base64')}`;
    const temporaryPath = `${this.credentialPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await this.fs.mkdir(this.userDataPath, { recursive: true, mode: 0o700 });
      await this.fs.writeFile(temporaryPath, stored, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await this.fs.rename(temporaryPath, this.credentialPath);
    } catch {
      try { await this.fs.rm(temporaryPath, { force: true }); } catch { /* keep the original safe error */ }
      throw new DesktopCredentialError('The encrypted API key could not be saved in the current user profile.', 'CREDENTIAL_SAVE_FAILED');
    }
  }

  async clearApiKey() {
    try {
      await this.fs.rm(this.credentialPath, { force: true });
    } catch {
      throw new DesktopCredentialError('The saved API key could not be removed.', 'CREDENTIAL_DELETE_FAILED');
    }
  }

  /** Main-process-only method. It is never exposed through the preload bridge. */
  async getApiKeyForRequest() {
    let stored;
    try {
      stored = await this.fs.readFile(this.credentialPath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return '';
      throw new DesktopCredentialError('The saved API credential could not be read.', 'CREDENTIAL_READ_FAILED');
    }

    if (typeof stored !== 'string' || stored.length > MAX_STORED_CREDENTIAL_LENGTH || !isCiphertext(stored)) {
      throw new DesktopCredentialError('The saved API credential is invalid. Remove it and enter the key again.', 'CREDENTIAL_DECRYPTION_FAILED');
    }
    this.assertSecureStorageAvailable();

    try {
      const apiKey = this.safeStorage.decryptString(Buffer.from(stored.slice(3), 'base64'));
      if (typeof apiKey !== 'string') throw new Error('Invalid decrypted value.');
      const normalizedKey = normalizeApiKey(apiKey);
      if (!normalizedKey) throw new Error('Empty decrypted value.');
      return normalizedKey;
    } catch {
      throw new DesktopCredentialError('The saved API key could not be decrypted. Check the current OS account and credential store, or remove and enter the key again.', 'CREDENTIAL_DECRYPTION_FAILED');
    }
  }

  assertSecureStorageAvailable() {
    let available = false;
    let backend = '';
    try {
      available = this.safeStorage.isEncryptionAvailable() === true;
      backend = typeof this.safeStorage.getSelectedStorageBackend === 'function'
        ? this.safeStorage.getSelectedStorageBackend()
        : '';
    } catch {
      available = false;
    }

    if (!available) {
      throw new DesktopCredentialError('Secure OS credential storage is unavailable. You can still test with a key entered for this session.', 'CREDENTIAL_STORAGE_UNAVAILABLE');
    }
    if (this.platform === 'linux' && !['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(backend)) {
      throw new DesktopCredentialError('Linux secure storage needs an unlocked libsecret or KWallet backend. The insecure basic_text fallback is disabled; you can still test with a key entered for this session.', 'CREDENTIAL_STORAGE_UNAVAILABLE');
    }
  }
}
