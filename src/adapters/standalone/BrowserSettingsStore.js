import {
  DEFAULT_BRANDING_PREFERENCES,
  DEFAULT_PUBLIC_SETTINGS,
} from '../../core/config/defaults.js';
import {
  normalizeApiBaseUrl,
  normalizePublicSettings,
  normalizeTheme,
} from '../../core/config/validation.js';

const PUBLIC_SETTINGS_KEY = 'acemusic.shared-core.public.v1';
const BRANDING_KEY = 'acemusic.shared-core.branding.v1';
const MUSIC_HISTORY_KEY = 'acemusic.shared-core.music-history.v1';
const MAX_MUSIC_HISTORY = 40;
const LOGO_FALLBACK_KEY = 'acemusic.shared-core.logo-fallback.v1';
const LOGO_DB_NAME = 'acemusic-shared-core';
const LOGO_DB_VERSION = 1;
const LOGO_OBJECT_STORE = 'branding-assets';
const LOGO_RECORD_KEY = 'custom-logo';

export class SettingsPersistenceError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'SettingsPersistenceError';
  }
}

function safeReadJson(storage, key) {
  try {
    const value = storage?.getItem(key);
    if (!value) return null;
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    if (!storage) throw new Error('Browser local storage is unavailable.');
    storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    throw new SettingsPersistenceError('Could not save these settings in this browser. Check available storage and try again.', error);
  }
}

function normalizeMusicHistory(records) {
  if (!Array.isArray(records)) return [];
  const normalized = [];
  for (const record of records.slice(0, MAX_MUSIC_HISTORY)) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    const taskId = typeof record.taskId === 'string' ? record.taskId.trim() : '';
    const baseUrl = typeof record.baseUrl === 'string' ? record.baseUrl : '';
    const statuses = new Set(['queued', 'running', 'succeeded', 'failed']);
    const status = statuses.has(record.status) ? record.status : null;
    const createdAt = typeof record.createdAt === 'string' && record.createdAt.length <= 64 && Number.isFinite(Date.parse(record.createdAt))
      ? new Date(record.createdAt).toISOString()
      : null;
    if (!taskId || taskId.length > 200 || !createdAt || !status || /[\u0000-\u001f\u007f]/.test(taskId)) continue;
    let safeBaseUrl;
    try { safeBaseUrl = normalizeApiBaseUrl(baseUrl); } catch { continue; }
    const prompt = typeof record.prompt === 'string' ? record.prompt.slice(0, 240) : '';
    const queuePosition = Number.isInteger(record.queuePosition) && record.queuePosition >= 0 ? record.queuePosition : null;
    const error = status === 'failed' ? 'The API reported that this generation failed.' : '';
    const outputs = Array.isArray(record.outputs) ? record.outputs.slice(0, 8).flatMap((output) => {
      if (!output || typeof output !== 'object' || typeof output.path !== 'string' || !output.path || output.path.length > 4096 || /[\u0000-\u001f\u007f]/.test(output.path)) return [];
      const metadata = {};
      if (output.metadata && typeof output.metadata === 'object' && !Array.isArray(output.metadata)) {
        for (const key of ['title', 'model', 'dit_model', 'lm_model']) {
          const value = output.metadata[key];
          if (typeof value === 'string' && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value)) metadata[key] = value;
        }
        for (const key of ['duration', 'audio_duration', 'bpm', 'seed']) {
          const value = Number(output.metadata[key]);
          if (Number.isFinite(value) && value >= 0 && value <= 100000) metadata[key] = value;
        }
      }
      return [{ path: output.path, metadata }];
    }) : [];
    normalized.push({ taskId, baseUrl: safeBaseUrl, prompt, createdAt, status, queuePosition, outputs, error });
  }
  return normalized;
}

function openLogoDatabase(indexedDBRef) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDBRef.open(LOGO_DB_NAME, LOGO_DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LOGO_OBJECT_STORE)) {
        database.createObjectStore(LOGO_OBJECT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the logo store.'));
    request.onblocked = () => reject(new Error('The logo store is blocked by another browser tab.'));
  });
}

function readLogoFromDatabase(database) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = database
        .transaction(LOGO_OBJECT_STORE, 'readonly')
        .objectStore(LOGO_OBJECT_STORE)
        .get(LOGO_RECORD_KEY);
    } catch (error) {
      reject(error);
      return;
    }
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not read the saved logo.'));
  });
}

function writeLogoToDatabase(database, blob) {
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = database.transaction(LOGO_OBJECT_STORE, 'readwrite');
      const objectStore = transaction.objectStore(LOGO_OBJECT_STORE);
      if (blob) objectStore.put(blob, LOGO_RECORD_KEY);
      else objectStore.delete(LOGO_RECORD_KEY);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the logo.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Saving the logo was cancelled.'));
  });
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

function dataUrlToBlob(value) {
  const match = /^data:(image\/(?:png|jpeg));base64,([a-z\d+/=]+)$/i.exec(value ?? '');
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: match[1].toLowerCase() });
  } catch {
    return null;
  }
}

/**
 * Standalone-web storage adapter. Public API configuration and user branding
 * are stored separately; no credential is accepted or written by this class.
 * Logos are kept in IndexedDB, with a localStorage fallback for small files.
 */
export class BrowserSettingsStore {
  constructor({ storage, indexedDBRef } = {}) {
    this.storage = storage ?? globalThis.localStorage;
    this.indexedDB = indexedDBRef ?? globalThis.indexedDB;
    this.databasePromise = null;
  }

  async loadPublicSettings() {
    const stored = safeReadJson(this.storage, PUBLIC_SETTINGS_KEY);
    return normalizePublicSettings(stored ?? DEFAULT_PUBLIC_SETTINGS);
  }

  async savePublicSettings(settings) {
    const safeSettings = { apiBaseUrl: normalizeApiBaseUrl(settings?.apiBaseUrl) };
    writeJson(this.storage, PUBLIC_SETTINGS_KEY, safeSettings);
    return safeSettings;
  }

  async loadBranding() {
    const stored = safeReadJson(this.storage, BRANDING_KEY);
    return {
      theme: normalizeTheme(stored?.theme ?? DEFAULT_BRANDING_PREFERENCES.theme),
    };
  }

  async saveBranding(branding) {
    const safeBranding = { theme: normalizeTheme(branding?.theme) };
    writeJson(this.storage, BRANDING_KEY, safeBranding);
    return safeBranding;
  }

  async loadMusicHistory() {
    const stored = safeReadJson(this.storage, MUSIC_HISTORY_KEY);
    return normalizeMusicHistory(stored?.records);
  }

  async saveMusicHistory(records) {
    const safeRecords = normalizeMusicHistory(records);
    writeJson(this.storage, MUSIC_HISTORY_KEY, { records: safeRecords });
    return safeRecords;
  }

  async loadLogo() {
    if (this.indexedDB) {
      try {
        this.databasePromise ??= openLogoDatabase(this.indexedDB);
        const database = await this.databasePromise;
        const logo = await readLogoFromDatabase(database);
        if (logo instanceof Blob) return logo;
      } catch {
        // Try the small-file fallback below if IndexedDB is disabled or blocked.
        this.databasePromise = null;
      }
    }

    try {
      const stored = this.storage?.getItem(LOGO_FALLBACK_KEY);
      return dataUrlToBlob(stored);
    } catch {
      return null;
    }
  }

  async saveLogo(blob) {
    if (blob !== null && !(blob instanceof Blob)) {
      throw new TypeError('Logo storage accepts a Blob or null.');
    }

    let indexedDbError;
    if (this.indexedDB) {
      try {
        this.databasePromise ??= openLogoDatabase(this.indexedDB);
        const database = await this.databasePromise;
        await writeLogoToDatabase(database, blob);
        try { this.storage?.removeItem(LOGO_FALLBACK_KEY); } catch { /* IndexedDB is the primary logo store. */ }
        return;
      } catch (error) {
        indexedDbError = error;
        this.databasePromise = null;
      }
    }

    try {
      if (!this.storage) throw new Error('Browser storage is unavailable.');
      if (blob) {
        if (typeof btoa !== 'function') throw new Error('Base64 encoding is unavailable.');
        this.storage.setItem(LOGO_FALLBACK_KEY, await blobToDataUrl(blob));
      } else {
        this.storage.removeItem(LOGO_FALLBACK_KEY);
      }
    } catch (error) {
      throw new SettingsPersistenceError('Could not save the logo in browser storage. Try a smaller image or allow site storage.', indexedDbError ?? error);
    }
  }
}
