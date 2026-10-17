import { ACE_STEP_HEALTH_PATH } from '../config/defaults.js';
import { isLoopbackUrl, normalizeApiBaseUrl, normalizeApiKey } from '../config/validation.js';

export class ApiConnectionError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ApiConnectionError';
    this.code = code;
    this.status = details.status;
    this.retryAfter = details.retryAfter;
  }
}

function healthUrl(baseUrl) {
  return new URL(ACE_STEP_HEALTH_PATH.replace(/^\//, ''), `${baseUrl}/`).toString();
}

function retryDelay(response) {
  const value = response.headers?.get?.('retry-after');
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return `${value.trim()} seconds`;
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    const seconds = Math.max(1, Math.ceil((date - Date.now()) / 1000));
    return `${seconds} seconds`;
  }
  return undefined;
}

function errorForHttpStatus(status, response) {
  if (status === 401 || status === 403) {
    return new ApiConnectionError('Authentication failed. Check the API key and its permissions.', 'AUTHENTICATION', { status });
  }
  if (status === 429) {
    const wait = retryDelay(response);
    return new ApiConnectionError(
      wait ? `The API rate-limited this test. Try again in about ${wait}.` : 'The API rate-limited this test. Try again shortly.',
      'RATE_LIMITED',
      { status, retryAfter: wait },
    );
  }
  if (status === 408) {
    return new ApiConnectionError('The API timed out while handling the health check. Try again.', 'TIMEOUT', { status });
  }
  if (status === 404) {
    return new ApiConnectionError('The server responded, but /health was not found. Check that this is an ACE-Step REST API base URL.', 'ENDPOINT_NOT_FOUND', { status });
  }
  if (status >= 500) {
    return new ApiConnectionError(`The API server returned HTTP ${status}. It may be starting or temporarily unavailable.`, 'SERVER_ERROR', { status });
  }
  return new ApiConnectionError(`The API server returned HTTP ${status}. Check the base URL and API configuration.`, 'HTTP_ERROR', { status });
}

function readApiErrorCode(payload) {
  const code = Number(payload?.code);
  if (code === 401 || code === 403) return 'AUTHENTICATION';
  if (code === 429) return 'RATE_LIMITED';
  return null;
}

/**
 * Test a configured ACE-Step REST API using its documented, read-only
 * GET /health endpoint. No request body is sent and the API key is never logged.
 */
export async function testAceStepConnection({
  baseUrl,
  apiKey = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
  signal,
} = {}) {
  const normalizedUrl = normalizeApiBaseUrl(baseUrl);
  const normalizedKey = normalizeApiKey(apiKey);

  if (normalizedKey && normalizedUrl.startsWith('http:') && !isLoopbackUrl(normalizedUrl)) {
    throw new ApiConnectionError('For safety, an API key can only be sent over HTTPS (or to a loopback development server).', 'INSECURE_ENDPOINT');
  }
  if (typeof fetchImpl !== 'function') {
    throw new ApiConnectionError('This runtime does not provide HTTP requests.', 'NETWORK_UNAVAILABLE');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ApiConnectionError('The connection timeout must be greater than zero.', 'INVALID_TIMEOUT');
  }

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
      reject(new ApiConnectionError('The connection test timed out. Check the API host and try again.', 'TIMEOUT'));
    }, timeoutMs);
  });

  const headers = { Accept: 'application/json' };
  if (normalizedKey) headers.Authorization = `Bearer ${normalizedKey}`;

  let response;
  try {
    response = await Promise.race([
      Promise.resolve().then(() => fetchImpl(healthUrl(normalizedUrl), {
        method: 'GET',
        headers,
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      })),
      timeout,
    ]);
  } catch (error) {
    if (error instanceof ApiConnectionError) throw error;
    if (didTimeout) {
      throw new ApiConnectionError('The connection test timed out. Check the API host and try again.', 'TIMEOUT');
    }
    if (didCancel) throw new ApiConnectionError('The connection test was cancelled.', 'CANCELLED');
    throw new ApiConnectionError(
      'Could not reach the API. Check the URL, network, TLS certificate, and server CORS settings. A server-side proxy may be needed for browser deployments.',
      'NETWORK_OR_CORS',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abortFromCaller);
  }

  if (!response || typeof response.status !== 'number') {
    throw new ApiConnectionError('The server returned an invalid HTTP response.', 'INVALID_RESPONSE');
  }
  if (response.status < 200 || response.status >= 300) {
    throw errorForHttpStatus(response.status, response);
  }

  const contentType = response.headers?.get?.('content-type') ?? '';
  if (!/(?:application\/json|\+json)(?:\s*;|$)/i.test(contentType)) {
    throw new ApiConnectionError('The health endpoint did not return JSON as documented.', 'INVALID_RESPONSE', { status: response.status });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiConnectionError('The health endpoint returned malformed JSON.', 'INVALID_RESPONSE', { status: response.status });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiConnectionError('The health endpoint returned an unexpected response format.', 'INVALID_RESPONSE', { status: response.status });
  }

  const apiErrorCode = readApiErrorCode(payload);
  if (apiErrorCode === 'AUTHENTICATION') {
    throw new ApiConnectionError('Authentication failed. Check the API key and its permissions.', 'AUTHENTICATION', { status: response.status });
  }
  if (apiErrorCode === 'RATE_LIMITED') {
    throw new ApiConnectionError('The API rate-limited this test. Try again shortly.', 'RATE_LIMITED', { status: response.status });
  }

  if (!Number.isInteger(payload.code) || payload.code !== 200 || payload.error != null || payload.data?.status !== 'ok') {
    throw new ApiConnectionError('The server returned JSON, but it did not match the documented ACE-Step health response.', 'INVALID_RESPONSE', { status: response.status });
  }

  return {
    ok: true,
    service: typeof payload.data.service === 'string' ? payload.data.service : 'ACE-Step API',
    version: typeof payload.data.version === 'string' ? payload.data.version : undefined,
  };
}
