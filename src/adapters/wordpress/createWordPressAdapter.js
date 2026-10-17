import { testAceStepConnection, ApiConnectionError } from '../../core/api/aceStepClient.js';
import { createMusicGenerationClient } from '../../core/api/musicGenerationClient.js';
import { DEFAULT_DEPLOYMENT_SETTINGS } from '../../core/config/defaults.js';
import { normalizeApiKey } from '../../core/config/validation.js';
import { BrowserSettingsStore } from '../standalone/BrowserSettingsStore.js';

export class WordPressDeploymentError extends Error {
  constructor(message, code = 'WORDPRESS_REQUEST_FAILED') {
    super(message);
    this.name = 'WordPressDeploymentError';
    this.code = code;
  }
}

function isLocalHost(hostname) {
  const host = String(hostname ?? '').toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
}

function resolveSameOriginUrl(value, locationRef) {
  if (!value || !locationRef?.origin) {
    throw new WordPressDeploymentError('WordPress REST configuration is missing. Reload the page or contact the site administrator.', 'WORDPRESS_CONFIG');
  }
  let url;
  try {
    url = new URL(value, locationRef.origin);
  } catch {
    throw new WordPressDeploymentError('WordPress REST configuration contains an invalid URL.', 'WORDPRESS_CONFIG');
  }
  if (url.origin !== locationRef.origin || url.protocol !== locationRef.protocol) {
    throw new WordPressDeploymentError('WordPress REST requests must stay on this site origin.', 'WORDPRESS_CONFIG');
  }
  return url.toString();
}

function makeHeaders(nonce, contentType = false) {
  const headers = { Accept: 'application/json' };
  if (nonce) headers['X-WP-Nonce'] = nonce;
  if (contentType) headers['Content-Type'] = 'application/json';
  return headers;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function deploymentErrorFromResponse(response, payload) {
  const code = typeof payload?.code === 'string' ? payload.code : '';
  const message = typeof payload?.message === 'string' ? payload.message : '';
  if (code === 'rest_cookie_invalid_nonce' || code === 'rest_not_logged_in' || code === 'rest_forbidden') {
    return new WordPressDeploymentError('WordPress authorization expired or was denied. Sign in as a site administrator and reload this page.', 'WORDPRESS_AUTH');
  }
  if (code === 'rest_no_route') {
    return new WordPressDeploymentError('The AceMusic WordPress REST route was not found. Confirm the plugin is active and the site REST API is available.', 'WORDPRESS_ROUTE');
  }
  if (code === 'acemusic_upstream_network_error') {
    return new ApiConnectionError('The WordPress server could not reach the configured API. Check the API host, TLS, and server outbound access.', 'NETWORK_OR_CORS', { status: response.status });
  }
  if (code.startsWith('acemusic_')) {
    return new ApiConnectionError(message || 'The WordPress API proxy rejected the connection test.', 'WORDPRESS_PROXY', { status: response.status });
  }
  if (response.status === 401 || response.status === 403) {
    return new WordPressDeploymentError('WordPress denied this request. Sign in as a site administrator and reload the page.', 'WORDPRESS_AUTH');
  }
  return null;
}

export class WordPressCredentialStore {
  constructor({ credentialsUrl, statusUrl, nonce, fetchImpl = globalThis.fetch, locationRef = globalThis.location }) {
    this.credentialsUrl = resolveSameOriginUrl(credentialsUrl, locationRef);
    this.statusUrl = resolveSameOriginUrl(statusUrl, locationRef);
    this.nonce = nonce ?? '';
    this.fetchImpl = fetchImpl;
    this.locationRef = locationRef;
  }

  ensureSecureTransport() {
    const isHttps = this.locationRef?.protocol === 'https:';
    if (!isHttps && !isLocalHost(this.locationRef?.hostname)) {
      throw new WordPressDeploymentError('Use HTTPS on the WordPress site before saving API credentials.', 'INSECURE_WORDPRESS_ORIGIN');
    }
  }

  async request(url, { method = 'GET', body } = {}) {
    if (typeof this.fetchImpl !== 'function') {
      throw new WordPressDeploymentError('This browser does not support the WordPress REST API.', 'WORDPRESS_NETWORK');
    }
    let response;
    try {
      response = await this.fetchImpl(url, {
        method,
        credentials: 'same-origin',
        headers: makeHeaders(this.nonce, body !== undefined),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new WordPressDeploymentError('Could not reach the WordPress REST API. Check the page connection and REST API configuration.', 'WORDPRESS_NETWORK');
    }
    const payload = await readJson(response);
    if (!response.ok) {
      throw deploymentErrorFromResponse(response, payload)
        ?? new WordPressDeploymentError('WordPress could not save the API credential. Check the server response and try again.', 'WORDPRESS_REQUEST_FAILED');
    }
    return payload;
  }

  async getApiKey() {
    // The secret deliberately never returns to browser JavaScript in this adapter.
    return '';
  }

  async hasApiKey() {
    const payload = await this.request(this.statusUrl);
    if (typeof payload?.configured !== 'boolean') {
      throw new WordPressDeploymentError('WordPress returned an invalid API credential status.', 'WORDPRESS_RESPONSE');
    }
    return payload.configured;
  }

  async setApiKey(value) {
    const apiKey = normalizeApiKey(value);
    if (!apiKey) return;
    this.ensureSecureTransport();
    const payload = await this.request(this.credentialsUrl, { method: 'POST', body: { apiKey } });
    if (payload?.configured !== true) {
      throw new WordPressDeploymentError('WordPress did not confirm that the API credential was saved.', 'WORDPRESS_RESPONSE');
    }
  }

  async clearApiKey() {
    const payload = await this.request(this.credentialsUrl, { method: 'DELETE' });
    if (payload?.configured !== false) {
      throw new WordPressDeploymentError('WordPress did not confirm that the API credential was removed.', 'WORDPRESS_RESPONSE');
    }
  }
}

function getHeader(headers, name) {
  if (headers && typeof headers.get === 'function') return headers.get(name) ?? '';
  const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1] ?? '';
}

function baseUrlForEndpoint(upstreamUrl, suffix) {
  const url = new URL(upstreamUrl);
  if (!url.pathname.endsWith(suffix)) {
    throw new ApiConnectionError('The API request did not match a supported ACE-Step endpoint.', 'UNSUPPORTED_API_ENDPOINT');
  }
  const prefix = url.pathname.slice(0, -suffix.length).replace(/\/+$/, '');
  return `${url.origin}${prefix}`;
}

export function createWordPressAdapter(root, {
  fetchImpl = globalThis.fetch,
  locationRef = globalThis.location,
} = {}) {
  const dataset = root?.dataset ?? {};
  const nonce = dataset.wpNonce ?? '';
  const healthTestUrl = resolveSameOriginUrl(dataset.wpHealthUrl, locationRef);
  const credentialsUrl = resolveSameOriginUrl(dataset.wpCredentialsUrl, locationRef);
  const statusUrl = resolveSameOriginUrl(dataset.wpCredentialStatusUrl, locationRef);
  const musicModelsUrl = resolveSameOriginUrl(dataset.wpMusicModelsUrl, locationRef);
  const musicGenerateUrl = resolveSameOriginUrl(dataset.wpMusicGenerateUrl, locationRef);
  const musicQueryUrl = resolveSameOriginUrl(dataset.wpMusicQueryUrl, locationRef);
  const musicAudioUrl = resolveSameOriginUrl(dataset.wpMusicAudioUrl, locationRef);
  const credentialStore = new WordPressCredentialStore({
    credentialsUrl,
    statusUrl,
    nonce,
    fetchImpl,
    locationRef,
  });

  const proxyFetch = async (_upstreamUrl, options) => {
    if (typeof fetchImpl !== 'function') {
      throw new ApiConnectionError('This browser does not support the WordPress REST proxy.', 'NETWORK_UNAVAILABLE');
    }
    const authorization = options.headers?.Authorization ?? '';
    const typedApiKey = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (typedApiKey) credentialStore.ensureSecureTransport();

    let response;
    try {
      response = await fetchImpl(healthTestUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: makeHeaders(nonce, true),
        body: JSON.stringify({ baseUrl: _upstreamUrl.replace(/\/health\/?$/, ''), apiKey: typedApiKey }),
        signal: options.signal,
      });
    } catch {
      throw new ApiConnectionError('Could not reach the WordPress API proxy. Check the page connection and REST API configuration.', 'NETWORK_OR_CORS');
    }

    const isUpstreamResponse = response.headers?.get?.('X-AceMusic-Upstream-Response') === '1';
    if (!response.ok && !isUpstreamResponse) {
      const payload = await readJson(response.clone());
      const deploymentError = deploymentErrorFromResponse(response, payload);
      if (deploymentError instanceof WordPressDeploymentError) {
        throw new ApiConnectionError(deploymentError.message, deploymentError.code, { status: response.status });
      }
      if (deploymentError) throw deploymentError;
    }
    return response;
  };

  const musicProxyFetch = async (upstreamUrl, options = {}) => {
    if (typeof fetchImpl !== 'function') {
      throw new ApiConnectionError('This browser does not support the WordPress music API proxy.', 'NETWORK_UNAVAILABLE');
    }

    const upstream = new URL(upstreamUrl);
    const routes = [
      { suffix: '/v1/models', url: musicModelsUrl },
      { suffix: '/release_task', url: musicGenerateUrl },
      { suffix: '/query_result', url: musicQueryUrl },
      { suffix: '/v1/audio', url: musicAudioUrl },
    ];
    const route = routes.find((candidate) => upstream.pathname.endsWith(candidate.suffix));
    if (!route) throw new ApiConnectionError('The WordPress proxy only allows documented ACE-Step music endpoints.', 'UNSUPPORTED_API_ENDPOINT');

    const baseUrl = baseUrlForEndpoint(upstreamUrl, route.suffix);
    const authorization = getHeader(options.headers, 'Authorization');
    const typedApiKey = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (typedApiKey) credentialStore.ensureSecureTransport();

    let requestUrl = route.url;
    const requestOptions = {
      credentials: 'same-origin',
      headers: makeHeaders(nonce, false),
      signal: options.signal,
    };

    try {
      if (route.suffix === '/v1/audio') {
        const path = upstream.searchParams.get('path');
        if (!path) throw new ApiConnectionError('The API audio request is missing its path.', 'INVALID_AUDIO_PATH');
        const target = new URL(route.url);
        target.searchParams.set('baseUrl', baseUrl);
        target.searchParams.set('path', path);
        requestUrl = target.toString();
        requestOptions.method = 'GET';
        if (typedApiKey) requestOptions.headers.Authorization = `Bearer ${typedApiKey}`;
      } else if (route.suffix === '/v1/models') {
        requestOptions.method = 'POST';
        requestOptions.headers = makeHeaders(nonce, true);
        requestOptions.body = JSON.stringify({ baseUrl, apiKey: typedApiKey });
      } else if (typeof FormData !== 'undefined' && options.body instanceof FormData) {
        const formData = new FormData();
        let referenceAudioExpected = false;
        for (const [key, value] of options.body.entries()) {
          formData.append(key, value);
          if (key === 'reference_audio' && typeof value !== 'string') referenceAudioExpected = true;
        }
        formData.append('baseUrl', baseUrl);
        formData.append('apiKey', typedApiKey);
        formData.append('acemusic_reference_audio_expected', referenceAudioExpected ? '1' : '0');
        requestOptions.method = 'POST';
        requestOptions.body = formData;
      } else {
        let body = {};
        if (typeof options.body === 'string') {
          try { body = JSON.parse(options.body); } catch {
            throw new ApiConnectionError('The music API request was not valid JSON.', 'INVALID_REQUEST');
          }
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw new ApiConnectionError('The music API request was not an object.', 'INVALID_REQUEST');
        }
        requestOptions.method = 'POST';
        requestOptions.headers = makeHeaders(nonce, true);
        requestOptions.body = JSON.stringify({ ...body, baseUrl, apiKey: typedApiKey });
      }

      const response = await fetchImpl(requestUrl, requestOptions);
      const isUpstreamResponse = response.headers?.get?.('X-AceMusic-Upstream-Response') === '1';
      if (!response.ok && !isUpstreamResponse) {
        const payload = await readJson(response.clone());
        const deploymentError = deploymentErrorFromResponse(response, payload);
        if (deploymentError instanceof WordPressDeploymentError) {
          throw new ApiConnectionError(deploymentError.message, deploymentError.code, { status: response.status });
        }
        if (deploymentError) throw deploymentError;
        throw new ApiConnectionError('The WordPress music API proxy rejected the request.', 'WORDPRESS_PROXY', { status: response.status });
      }
      return response;
    } catch (error) {
      if (error instanceof ApiConnectionError || error instanceof WordPressDeploymentError) throw error;
      throw new ApiConnectionError('Could not reach the WordPress music API proxy. Check the page connection and REST API configuration.', 'NETWORK_OR_CORS');
    }
  };

  return {
    settingsStore: new BrowserSettingsStore(),
    credentialStore,
    apiClient: {
      testConnection({ baseUrl, apiKey }) {
        return testAceStepConnection({ baseUrl, apiKey, fetchImpl: proxyFetch, timeoutMs: 15000 });
      },
    },
    musicClient: createMusicGenerationClient({ fetchImpl: musicProxyFetch }),
    deployment: Object.freeze({
      ...DEFAULT_DEPLOYMENT_SETTINGS,
      target: 'wordpress',
      apiAccess: 'wordpress-server-proxy',
    }),
  };
}
