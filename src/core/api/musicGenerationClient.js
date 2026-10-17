import { ApiConnectionError } from './aceStepClient.js';
import { isLoopbackUrl, normalizeApiBaseUrl, normalizeApiKey } from '../config/validation.js';

export const MAX_REFERENCE_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_DOWNLOAD_BYTES = 64 * 1024 * 1024;
export const MAX_TASK_IDS_PER_QUERY = 50;

const AUDIO_FORMATS = new Set(['mp3', 'wav', 'flac', 'ogg']);
const TIME_SIGNATURES = new Set(['2/4', '3/4', '4/4', '6/8']);
const TASK_STATUSES = new Map([[0, 'running'], [1, 'succeeded'], [2, 'failed']]);
const MAX_PROMPT_LENGTH = 4000;
const MAX_LYRICS_LENGTH = 12000;

function apiEndpoint(baseUrl, path) {
  return new URL(path.replace(/^\/+/, ''), `${baseUrl}/`).toString();
}

function validateSecureEndpoint(baseUrl, apiKey) {
  if (apiKey && baseUrl.startsWith('http:') && !isLoopbackUrl(baseUrl)) {
    throw new ApiConnectionError('For safety, an API key can only be sent over HTTPS (or to a loopback development server).', 'INSECURE_ENDPOINT');
  }
}

function validateShortText(value, name, maxLength, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && !value.trim())) {
    throw new ApiConnectionError(`${name} must be ${allowEmpty ? 'text' : 'non-empty text'} up to ${maxLength} characters.`, 'INVALID_GENERATION_OPTIONS');
  }
  if (/\u0000/.test(value)) {
    throw new ApiConnectionError(`${name} contains an unsupported character.`, 'INVALID_GENERATION_OPTIONS');
  }
  return value.trim();
}

function optionalNumber(value, name, minimum, maximum, integer = false) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum || (integer && !Number.isInteger(number))) {
    throw new ApiConnectionError(`${name} must be ${integer ? 'an integer' : 'a number'} from ${minimum} to ${maximum}.`, 'INVALID_GENERATION_OPTIONS');
  }
  return number;
}

/** Validate and whitelist only the documented fields used by the shared studio. */
export function normalizeGenerationOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiConnectionError('Generation options must be an object.', 'INVALID_GENERATION_OPTIONS');
  }

  const prompt = validateShortText(value.prompt, 'Prompt', MAX_PROMPT_LENGTH);
  const lyrics = value.lyrics === undefined
    ? ''
    : validateShortText(value.lyrics, 'Lyrics', MAX_LYRICS_LENGTH, { allowEmpty: true });
  const vocalLanguage = typeof value.vocalLanguage === 'string' ? value.vocalLanguage.trim() : 'en';
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(vocalLanguage) || vocalLanguage.length > 16) {
    throw new ApiConnectionError('Choose a valid vocal-language code.', 'INVALID_GENERATION_OPTIONS');
  }

  const audioFormat = value.audioFormat ?? 'mp3';
  if (!AUDIO_FORMATS.has(audioFormat)) {
    throw new ApiConnectionError('Choose a supported audio format: MP3, WAV, FLAC, or OGG.', 'INVALID_GENERATION_OPTIONS');
  }

  const duration = optionalNumber(value.audioDuration, 'Duration', 10, 600);
  const bpm = optionalNumber(value.bpm, 'BPM', 30, 300, true);
  const inferenceSteps = optionalNumber(value.inferenceSteps, 'Inference steps', 1, 200, true);
  const seed = optionalNumber(value.seed, 'Seed', 0, 2147483647, true);
  const guidanceScale = optionalNumber(value.guidanceScale, 'Guidance scale', 0, 20);

  let timeSignature;
  if (value.timeSignature !== undefined && value.timeSignature !== null && value.timeSignature !== '') {
    timeSignature = String(value.timeSignature);
    if (!TIME_SIGNATURES.has(timeSignature)) {
      throw new ApiConnectionError('Choose a supported time signature.', 'INVALID_GENERATION_OPTIONS');
    }
  }

  let keyScale;
  if (value.keyScale !== undefined && value.keyScale !== null && value.keyScale !== '') {
    keyScale = validateShortText(String(value.keyScale), 'Key', 16);
    if (!/^(?:[A-G](?:#|b)?)(?:\s*(?:major|minor|maj|min))?$/i.test(keyScale)) {
      throw new ApiConnectionError('Enter a musical key such as C major or F# minor.', 'INVALID_GENERATION_OPTIONS');
    }
  }

  let model;
  if (value.model !== undefined && value.model !== null && value.model !== '') {
    model = validateShortText(value.model, 'Model', 128);
    if (!/^[\w.-]+$/.test(model)) {
      throw new ApiConnectionError('The selected model name contains unsupported characters.', 'INVALID_GENERATION_OPTIONS');
    }
  }

  const normalized = {
    prompt,
    lyrics,
    thinking: value.thinking !== false,
    vocal_language: vocalLanguage,
    audio_format: audioFormat,
    task_type: 'text2music',
    use_random_seed: seed === undefined,
  };
  if (model) normalized.model = model;
  if (duration !== undefined) normalized.audio_duration = duration;
  if (bpm !== undefined) normalized.bpm = bpm;
  if (inferenceSteps !== undefined) normalized.inference_steps = inferenceSteps;
  if (seed !== undefined) normalized.seed = seed;
  if (guidanceScale !== undefined) normalized.guidance_scale = guidanceScale;
  if (timeSignature !== undefined) normalized.time_signature = timeSignature;
  if (keyScale !== undefined) normalized.key_scale = keyScale;
  if (value.useFormat === true) normalized.use_format = true;

  return normalized;
}

function isBlob(value) {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function safeFileName(value) {
  const name = typeof value === 'string' ? value : 'reference-audio';
  const cleaned = name.split(/[\\/]/).pop()?.replace(/[^\w.() -]/g, '_').slice(0, 120);
  return cleaned || 'reference-audio';
}

function validateReferenceAudio(file) {
  if (!file) return null;
  if (!isBlob(file) && typeof file !== 'object') {
    throw new ApiConnectionError('Reference audio must be a supported file.', 'INVALID_REFERENCE_AUDIO');
  }
  const size = Number(file.size ?? file.blob?.size ?? file.bytes?.byteLength ?? file.bytes?.length ?? 0);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_REFERENCE_AUDIO_BYTES) {
    throw new ApiConnectionError('Reference audio must be larger than 0 bytes and no larger than 25 MB.', 'INVALID_REFERENCE_AUDIO');
  }
  const filename = safeFileName(file.name);
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const acceptedExtensions = new Set(['mp3', 'wav', 'flac', 'ogg', 'oga', 'm4a', 'aac', 'mp4', 'webm']);
  const mime = typeof file.type === 'string' ? file.type.toLowerCase().split(';')[0] : '';
  const acceptedMime = new Set([
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/flac',
    'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'video/mp4', 'application/octet-stream',
  ]);
  if (!acceptedExtensions.has(extension) && !acceptedMime.has(mime)) {
    throw new ApiConnectionError('Choose an MP3, WAV, FLAC, OGG, M4A, AAC, or WebM audio file.', 'INVALID_REFERENCE_AUDIO');
  }
  if (mime && !acceptedMime.has(mime) && !acceptedExtensions.has(extension)) {
    throw new ApiConnectionError('The selected reference file is not a supported audio type.', 'INVALID_REFERENCE_AUDIO');
  }
  return file;
}

function generationRequestBody(options, referenceAudio) {
  if (!referenceAudio) return JSON.stringify(options);
  if (typeof FormData !== 'function') {
    throw new ApiConnectionError('This runtime cannot upload reference audio.', 'UPLOAD_UNAVAILABLE');
  }

  const body = new FormData();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== null) body.append(key, String(value));
  }

  if (isBlob(referenceAudio)) {
    body.append('reference_audio', referenceAudio, safeFileName(referenceAudio.name));
  } else if (referenceAudio.blob && isBlob(referenceAudio.blob)) {
    body.append('reference_audio', referenceAudio.blob, safeFileName(referenceAudio.name));
  } else if (referenceAudio.bytes && typeof Blob === 'function') {
    const bytes = referenceAudio.bytes instanceof Uint8Array
      ? referenceAudio.bytes
      : new Uint8Array(referenceAudio.bytes);
    const blob = new Blob([bytes], { type: referenceAudio.type || 'application/octet-stream' });
    body.append('reference_audio', blob, safeFileName(referenceAudio.name));
  } else {
    throw new ApiConnectionError('The reference audio could not be read for upload.', 'INVALID_REFERENCE_AUDIO');
  }
  return body;
}

function requestHeaders(apiKey, json = false) {
  const headers = { Accept: 'application/json' };
  if (json) headers['Content-Type'] = 'application/json';
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function errorForHttpStatus(status, response) {
  if (status === 401 || status === 403) {
    return new ApiConnectionError('Authentication failed. Check the API key and its permissions.', 'AUTHENTICATION', { status });
  }
  if (status === 429) {
    const retryAfter = response.headers?.get?.('retry-after');
    return new ApiConnectionError(
      retryAfter ? `The API rate-limited this request. Try again in about ${retryAfter}.` : 'The API rate-limited this request. Try again shortly.',
      'RATE_LIMITED',
      { status, retryAfter: retryAfter ?? undefined },
    );
  }
  if (status === 408) return new ApiConnectionError('The API timed out while handling the request. Try again.', 'TIMEOUT', { status });
  if (status >= 500) return new ApiConnectionError(`The API server returned HTTP ${status}. It may be temporarily unavailable.`, 'SERVER_ERROR', { status });
  return new ApiConnectionError(`The API returned HTTP ${status}. Check the API configuration and request options.`, 'HTTP_ERROR', { status });
}

function normalizeApiEnvelope(payload, response) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiConnectionError('The API returned an unexpected response format.', 'INVALID_RESPONSE', { status: response.status });
  }
  const code = Number(payload.code);
  if (code === 401 || code === 403) throw errorForHttpStatus(code, response);
  if (code === 429) throw errorForHttpStatus(code, response);
  if (!Number.isInteger(code) || code !== 200 || payload.error != null) {
    throw new ApiConnectionError('The API rejected the request or returned an invalid ACE-Step response.', 'API_REJECTED', { status: response.status });
  }
  return payload.data;
}

async function requestJson(fetchImpl, url, { apiKey, method = 'GET', body, signal, timeoutMs = 30000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new ApiConnectionError('This runtime does not provide HTTP requests.', 'NETWORK_UNAVAILABLE');
  const controller = new AbortController();
  let didTimeout = false;
  let didCancel = false;
  const abortFromCaller = () => {
    didCancel = true;
    controller.abort();
  };
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener?.('abort', abortFromCaller, { once: true });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      didTimeout = true;
      controller.abort();
      reject(new ApiConnectionError('The API request timed out. Check the server and try again.', 'TIMEOUT'));
    }, timeoutMs);
  });

  let response;
  try {
    response = await Promise.race([
      Promise.resolve().then(() => fetchImpl(url, {
        method,
        headers: requestHeaders(apiKey, typeof body === 'string'),
        ...(body !== undefined ? { body } : {}),
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      })),
      timeout,
    ]);
  } catch (error) {
    if (error instanceof ApiConnectionError) throw error;
    if (didTimeout) throw new ApiConnectionError('The API request timed out. Check the server and try again.', 'TIMEOUT');
    if (didCancel) throw new ApiConnectionError('The API request was cancelled.', 'CANCELLED');
    throw new ApiConnectionError('Could not reach the API. Check the URL, network, TLS certificate, server CORS settings, or server-side proxy.', 'NETWORK_OR_CORS');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abortFromCaller);
  }

  if (!response || typeof response.status !== 'number') throw new ApiConnectionError('The API returned an invalid HTTP response.', 'INVALID_RESPONSE');
  if (response.status < 200 || response.status >= 300) throw errorForHttpStatus(response.status, response);
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (!/(?:application\/json|\+json)(?:\s*;|$)/i.test(contentType)) {
    throw new ApiConnectionError('The API response was not JSON as documented.', 'INVALID_RESPONSE', { status: response.status });
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiConnectionError('The API returned malformed JSON.', 'INVALID_RESPONSE', { status: response.status });
  }
  return normalizeApiEnvelope(payload, response);
}

function sanitizeModelName(value) {
  if (typeof value !== 'string' || value.length > 128 || !/^[\w.-]+$/.test(value)) return null;
  return value;
}

function normalizeModels(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.models)) {
    throw new ApiConnectionError('The API did not return a documented model list.', 'INVALID_RESPONSE');
  }
  const models = [];
  const seen = new Set();
  for (const item of data.models) {
    const name = sanitizeModelName(typeof item === 'string' ? item : item?.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    models.push({ name, isDefault: typeof item === 'object' && item?.is_default === true });
  }
  const defaultModel = sanitizeModelName(data.default_model)
    ?? models.find((model) => model.isDefault)?.name
    ?? null;
  return { models, defaultModel };
}

function normalizeAudioPath(file) {
  if (typeof file !== 'string' || file.length === 0 || file.length > 4096 || /[\u0000-\u001f\u007f]/.test(file)) return null;
  try {
    if (/^https?:\/\//i.test(file) || file.startsWith('/v1/audio?')) {
      const parsed = new URL(file, 'https://acemusic.invalid');
      const queryPath = parsed.searchParams.get('path');
      if (queryPath) return queryPath.slice(0, 4096);
      if (parsed.pathname.endsWith('/v1/audio')) return null;
      return `${parsed.pathname}${parsed.search}`.slice(0, 4096);
    }
  } catch {
    return null;
  }
  return file;
}

function safeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const metadata = {};
  for (const key of ['title', 'model', 'dit_model', 'lm_model']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.length <= 160 && !/[\u0000-\u001f\u007f]/.test(candidate)) {
      metadata[key] = candidate;
    }
  }
  for (const key of ['duration', 'audio_duration', 'bpm', 'seed']) {
    const candidate = Number(value[key]);
    if (Number.isFinite(candidate) && candidate >= 0 && candidate <= 100000) metadata[key] = candidate;
  }
  return metadata;
}

function parseTaskOutputs(record, apiKey = '') {
  let result = record.result;
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { return []; }
  }
  if (!Array.isArray(result)) return [];
  const outputs = [];
  for (const item of result) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const path = normalizeAudioPath(item.file ?? item.path);
    if (!path) continue;
    let decodedPath = path;
    try { decodedPath = decodeURIComponent(path); } catch { /* Keep the encoded path for the comparison below. */ }
    if (apiKey && (path.includes(apiKey) || decodedPath.includes(apiKey))) continue;
    outputs.push({ path, metadata: safeMetadata(item.metas ?? item.metadata ?? item) });
  }
  return outputs;
}

function normalizeTaskRecords(data, expectedIds, apiKey = '') {
  if (!Array.isArray(data)) throw new ApiConnectionError('The API did not return documented task status records.', 'INVALID_RESPONSE');
  const expected = new Set(expectedIds);
  return data.flatMap((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return [];
    const taskId = typeof record.task_id === 'string' ? record.task_id : '';
    const rawStatus = Number(record.status);
    const status = TASK_STATUSES.get(rawStatus);
    if (!taskId || taskId.length > 200 || !expected.has(taskId) || !status) return [];
    const error = status === 'failed' ? 'The API reported that this generation failed.' : '';
    return [{ taskId, status, outputs: status === 'succeeded' ? parseTaskOutputs(record, apiKey) : [], error }];
  });
}

function validateTaskIds(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TASK_IDS_PER_QUERY) {
    throw new ApiConnectionError(`Query between 1 and ${MAX_TASK_IDS_PER_QUERY} task IDs at a time.`, 'INVALID_TASK_IDS');
  }
  const ids = [...new Set(value)];
  if (ids.length !== value.length || ids.some((id) => typeof id !== 'string' || !id.trim() || id.length > 200 || /[\u0000-\u001f\u007f]/.test(id))) {
    throw new ApiConnectionError('Task IDs must be unique, non-empty strings of at most 200 characters.', 'INVALID_TASK_IDS');
  }
  return ids;
}

function inferAudioFilename(path, contentType) {
  const extensionByType = {
    'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac',
    'audio/ogg': 'ogg', 'audio/aac': 'aac', 'audio/mp4': 'm4a', 'application/octet-stream': 'audio',
  };
  const cleanPath = path.split('?')[0];
  const candidate = cleanPath.split('/').pop()?.split('\\').pop() ?? '';
  const safe = candidate.replace(/[^\w.-]/g, '_').slice(0, 120);
  if (safe && /\.[a-z\d]{2,5}$/i.test(safe)) return safe;
  const extension = extensionByType[contentType.toLowerCase().split(';')[0]] ?? 'audio';
  return `acemusic-track.${extension}`;
}

export function createMusicGenerationClient({ fetchImpl = globalThis.fetch, timeouts = {} } = {}) {
  const requestTimeout = (name, fallback) => Number.isFinite(timeouts[name]) && timeouts[name] > 0 ? timeouts[name] : fallback;
  return {
    async listModels({ baseUrl, apiKey = '', signal } = {}) {
      const normalizedUrl = normalizeApiBaseUrl(baseUrl);
      const normalizedKey = normalizeApiKey(apiKey);
      validateSecureEndpoint(normalizedUrl, normalizedKey);
      const data = await requestJson(fetchImpl, apiEndpoint(normalizedUrl, 'v1/models'), {
        apiKey: normalizedKey,
        signal,
        timeoutMs: requestTimeout('models', 15000),
      });
      return normalizeModels(data);
    },

    async submitGeneration({ baseUrl, apiKey = '', options, referenceAudio, signal } = {}) {
      const normalizedUrl = normalizeApiBaseUrl(baseUrl);
      const normalizedKey = normalizeApiKey(apiKey);
      validateSecureEndpoint(normalizedUrl, normalizedKey);
      const normalizedOptions = normalizeGenerationOptions(options);
      const file = validateReferenceAudio(referenceAudio);
      const body = generationRequestBody(normalizedOptions, file);
      const data = await requestJson(fetchImpl, apiEndpoint(normalizedUrl, 'release_task'), {
        apiKey: normalizedKey,
        method: 'POST',
        body,
        signal,
        timeoutMs: requestTimeout('generate', 45000),
      });
      const taskId = typeof data?.task_id === 'string' ? data.task_id : '';
      if (!taskId || taskId.length > 200 || /[\u0000-\u001f\u007f]/.test(taskId)) {
        throw new ApiConnectionError('The API did not return a task ID for this generation request.', 'INVALID_RESPONSE');
      }
      const rawStatus = typeof data.status === 'string' ? data.status : 'queued';
      const queuePosition = Number.isInteger(data.queue_position) && data.queue_position >= 0 ? data.queue_position : null;
      return { taskId, status: rawStatus.slice(0, 32), queuePosition };
    },

    async queryTasks({ baseUrl, apiKey = '', taskIds, signal } = {}) {
      const normalizedUrl = normalizeApiBaseUrl(baseUrl);
      const normalizedKey = normalizeApiKey(apiKey);
      validateSecureEndpoint(normalizedUrl, normalizedKey);
      const ids = validateTaskIds(taskIds);
      const data = await requestJson(fetchImpl, apiEndpoint(normalizedUrl, 'query_result'), {
        apiKey: normalizedKey,
        method: 'POST',
        body: JSON.stringify({ task_id_list: ids }),
        signal,
        timeoutMs: requestTimeout('query', 20000),
      });
      return normalizeTaskRecords(data, ids, normalizedKey);
    },

    async fetchAudio({ baseUrl, apiKey = '', path, signal } = {}) {
      const normalizedUrl = normalizeApiBaseUrl(baseUrl);
      const normalizedKey = normalizeApiKey(apiKey);
      validateSecureEndpoint(normalizedUrl, normalizedKey);
      if (typeof path !== 'string' || !path || path.length > 4096 || /[\u0000-\u001f\u007f]/.test(path)) {
        throw new ApiConnectionError('The API returned an invalid audio path.', 'INVALID_AUDIO_PATH');
      }
      const url = new URL(apiEndpoint(normalizedUrl, 'v1/audio'));
      url.searchParams.set('path', path);
      const controller = new AbortController();
      let didTimeout = false;
      let didCancel = false;
      const abortFromCaller = () => { didCancel = true; controller.abort(); };
      if (signal?.aborted) abortFromCaller();
      else signal?.addEventListener?.('abort', abortFromCaller, { once: true });
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          didTimeout = true;
          controller.abort();
          reject(new ApiConnectionError('The audio download timed out. Try again.', 'TIMEOUT'));
        }, requestTimeout('audio', 60000));
      });
      let response;
      try {
        if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
        response = await Promise.race([
          Promise.resolve().then(() => fetchImpl(url.toString(), {
            method: 'GET',
            headers: requestHeaders(normalizedKey, false),
            cache: 'no-store',
            redirect: 'error',
            signal: controller.signal,
          })),
          timeout,
        ]);
      } catch (error) {
        if (error instanceof ApiConnectionError) throw error;
        if (didTimeout) throw new ApiConnectionError('The audio download timed out. Try again.', 'TIMEOUT');
        if (didCancel) throw new ApiConnectionError('The audio download was cancelled.', 'CANCELLED');
        throw new ApiConnectionError('Could not download the generated audio from the API.', 'NETWORK_OR_CORS');
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', abortFromCaller);
      }
      if (!response || typeof response.status !== 'number') throw new ApiConnectionError('The audio endpoint returned an invalid HTTP response.', 'INVALID_RESPONSE');
      if (response.status < 200 || response.status >= 300) throw errorForHttpStatus(response.status, response);
      const contentType = response.headers?.get?.('content-type') ?? '';
      if (!/^(?:audio\/[a-z0-9.+-]+|application\/octet-stream)(?:\s*;|$)/i.test(contentType)) {
        throw new ApiConnectionError('The audio endpoint did not return an audio file.', 'INVALID_AUDIO_RESPONSE', { status: response.status });
      }
      const length = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(length) && length > MAX_AUDIO_DOWNLOAD_BYTES) {
        throw new ApiConnectionError('The audio file exceeds the 64 MB download limit.', 'AUDIO_TOO_LARGE');
      }
      let bytes;
      try { bytes = new Uint8Array(await response.arrayBuffer()); } catch {
        throw new ApiConnectionError('The generated audio could not be read.', 'INVALID_AUDIO_RESPONSE');
      }
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_DOWNLOAD_BYTES) {
        throw new ApiConnectionError('The audio file is empty or exceeds the 64 MB download limit.', 'INVALID_AUDIO_RESPONSE');
      }
      const normalizedType = contentType.split(';')[0].toLowerCase();
      return { bytes, contentType: normalizedType, filename: inferAudioFilename(path, normalizedType) };
    },
  };
}
