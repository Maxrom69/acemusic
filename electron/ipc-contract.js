import { normalizeApiBaseUrl, normalizeApiKey } from '../src/core/config/validation.js';
import { MAX_REFERENCE_AUDIO_BYTES, normalizeGenerationOptions } from '../src/core/api/musicGenerationClient.js';

export const IPC_CHANNELS = Object.freeze({
  HAS_API_KEY: 'acemusic:credentials:has-api-key',
  SAVE_API_KEY: 'acemusic:credentials:save-api-key',
  CLEAR_API_KEY: 'acemusic:credentials:clear-api-key',
  TEST_API_CONNECTION: 'acemusic:api:test-connection',
  LIST_MODELS: 'acemusic:api:list-models',
  SUBMIT_GENERATION: 'acemusic:api:submit-generation',
  QUERY_TASKS: 'acemusic:api:query-tasks',
  FETCH_AUDIO: 'acemusic:api:fetch-audio',
});

function requirePlainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${name} must be a plain object.`);
  }
  return value;
}

function rejectUnknownKeys(value, allowed, name) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new TypeError(`${name} contains an unsupported field.`);
}

export function validateNoIpcPayload(payload) {
  if (payload !== undefined) throw new TypeError('This desktop operation does not accept a payload.');
}

export function validateCredentialPayload(payload) {
  const object = requirePlainObject(payload, 'Credential request');
  rejectUnknownKeys(object, ['apiKey'], 'Credential request');
  if (typeof object.apiKey !== 'string' || object.apiKey.length === 0 || object.apiKey.length > 4096) {
    throw new TypeError('Enter an API key of 1 to 4096 characters.');
  }
  const apiKey = normalizeApiKey(object.apiKey);
  if (!apiKey) throw new TypeError('Enter a non-empty API key before saving it.');
  return { apiKey };
}

export function validateApiTestPayload(payload) {
  const object = requirePlainObject(payload, 'API test request');
  rejectUnknownKeys(object, ['baseUrl', 'apiKey'], 'API test request');
  if (typeof object.baseUrl !== 'string' || object.baseUrl.length > 2048) {
    throw new TypeError('Enter a valid API base URL.');
  }
  const apiKey = object.apiKey ?? '';
  if (typeof apiKey !== 'string' || apiKey.length > 4096) {
    throw new TypeError('The API key must be text and no longer than 4096 characters.');
  }
  return {
    baseUrl: normalizeApiBaseUrl(object.baseUrl),
    apiKey: normalizeApiKey(apiKey),
  };
}

function validateMusicBasePayload(payload, name, extraKeys = []) {
  const object = requirePlainObject(payload, name);
  rejectUnknownKeys(object, ['baseUrl', 'apiKey', ...extraKeys], name);
  const { baseUrl, apiKey } = validateApiTestPayload({ baseUrl: object.baseUrl, apiKey: object.apiKey ?? '' });
  return { object, baseUrl, apiKey };
}

export function validateModelsPayload(payload) {
  const { baseUrl, apiKey } = validateMusicBasePayload(payload, 'Model request');
  return { baseUrl, apiKey };
}

const GENERATION_OPTION_KEYS = Object.freeze([
  'prompt', 'lyrics', 'model', 'audioDuration', 'bpm', 'keyScale', 'timeSignature',
  'audioFormat', 'inferenceSteps', 'guidanceScale', 'thinking', 'useFormat', 'seed', 'vocalLanguage',
]);

function validateReferenceAudioTransfer(value) {
  const file = requirePlainObject(value, 'Reference audio');
  rejectUnknownKeys(file, ['name', 'type', 'bytes'], 'Reference audio');
  if (typeof file.name !== 'string' || file.name.length === 0 || file.name.length > 255 || /[\u0000-\u001f\u007f]/.test(file.name)) {
    throw new TypeError('Reference audio must have a valid filename.');
  }
  if (typeof file.type !== 'string' || file.type.length > 128) throw new TypeError('Reference audio has an invalid MIME type.');
  const bytes = file.bytes instanceof Uint8Array
    ? file.bytes
    : file.bytes instanceof ArrayBuffer
      ? new Uint8Array(file.bytes)
      : null;
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_REFERENCE_AUDIO_BYTES) {
    throw new TypeError('Reference audio must be between 1 byte and 25 MB.');
  }
  return { name: file.name, type: file.type, bytes };
}

export function validateGenerationPayload(payload) {
  const { object, baseUrl, apiKey } = validateMusicBasePayload(payload, 'Generation request', ['options', 'referenceAudio']);
  const options = requirePlainObject(object.options, 'Generation options');
  rejectUnknownKeys(options, GENERATION_OPTION_KEYS, 'Generation options');
  normalizeGenerationOptions(options);
  return {
    baseUrl,
    apiKey,
    options: { ...options },
    ...(object.referenceAudio !== undefined ? { referenceAudio: validateReferenceAudioTransfer(object.referenceAudio) } : {}),
  };
}

export function validateTaskQueryPayload(payload) {
  const { object, baseUrl, apiKey } = validateMusicBasePayload(payload, 'Task query request', ['taskIds']);
  const taskIds = object.taskIds;
  if (!Array.isArray(taskIds) || taskIds.length === 0 || taskIds.length > 50) {
    throw new TypeError('Query between 1 and 50 task IDs at a time.');
  }
  if (taskIds.some((taskId) => typeof taskId !== 'string' || !taskId.trim() || taskId.length > 200 || /[\u0000-\u001f\u007f]/.test(taskId))) {
    throw new TypeError('Task IDs must be non-empty text of at most 200 characters.');
  }
  if (new Set(taskIds).size !== taskIds.length) throw new TypeError('Task IDs must be unique.');
  return { baseUrl, apiKey, taskIds: [...taskIds] };
}

export function validateAudioFetchPayload(payload) {
  const { object, baseUrl, apiKey } = validateMusicBasePayload(payload, 'Audio request', ['path']);
  if (typeof object.path !== 'string' || !object.path || object.path.length > 4096 || /[\u0000-\u001f\u007f]/.test(object.path)) {
    throw new TypeError('The audio path is invalid.');
  }
  return { baseUrl, apiKey, path: object.path };
}

/** Only these safe fields cross IPC; stack traces and request values do not. */
export function serializeIpcError(error) {
  const message = typeof error?.message === 'string' && error.message.length <= 300
    ? error.message
    : 'The desktop operation failed. Restart the application and try again.';
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
    ? error.code
    : 'DESKTOP_OPERATION_FAILED';
  const status = Number.isInteger(error?.status) ? error.status : undefined;
  const retryAfter = typeof error?.retryAfter === 'string' && error.retryAfter.length <= 64
    ? error.retryAfter
    : undefined;
  return { message, code, ...(status !== undefined ? { status } : {}), ...(retryAfter ? { retryAfter } : {}) };
}
