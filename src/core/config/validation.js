import { DEFAULT_API_BASE_URL, DEFAULT_THEME, THEME_FIELDS } from './defaults.js';

export class SettingsValidationError extends Error {
  constructor(message, code = 'INVALID_SETTINGS') {
    super(message);
    this.name = 'SettingsValidationError';
    this.code = code;
  }
}

export function normalizeApiBaseUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SettingsValidationError('Enter an API base URL.', 'INVALID_URL');
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new SettingsValidationError('Enter a complete URL, including https:// or http://.', 'INVALID_URL');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new SettingsValidationError('The API URL must use HTTPS or HTTP.', 'INVALID_URL');
  }
  if (!parsed.hostname) {
    throw new SettingsValidationError('The API URL must include a hostname.', 'INVALID_URL');
  }
  if (parsed.username || parsed.password) {
    throw new SettingsValidationError('Do not put credentials in the URL. Use the API key field instead.', 'URL_CREDENTIALS');
  }
  if (parsed.search || parsed.hash) {
    throw new SettingsValidationError('The API base URL cannot include a query string or fragment.', 'INVALID_URL');
  }

  const path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${path}`;
}

export function isLoopbackUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '::1' || host === '127.0.0.1' || host.endsWith('.localhost');
  } catch {
    return false;
  }
}

export function normalizeHexColor(value) {
  if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value.trim())) {
    throw new SettingsValidationError('Enter a valid HEX color such as #6757DE.', 'INVALID_COLOR');
  }

  const color = value.trim().toUpperCase();
  if (color.length === 4) {
    return `#${[...color.slice(1)].map((digit) => `${digit}${digit}`).join('')}`;
  }
  return color;
}

export function normalizeTheme(theme) {
  const normalized = { ...DEFAULT_THEME };
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) return normalized;

  for (const { key } of THEME_FIELDS) {
    try {
      if (Object.hasOwn(theme, key)) normalized[key] = normalizeHexColor(theme[key]);
    } catch {
      // Corrupt or out-of-date persisted values fall back per field.
    }
  }
  return normalized;
}

export function normalizePublicSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { apiBaseUrl: DEFAULT_API_BASE_URL };
  }

  try {
    return { apiBaseUrl: normalizeApiBaseUrl(settings.apiBaseUrl ?? DEFAULT_API_BASE_URL) };
  } catch {
    return { apiBaseUrl: DEFAULT_API_BASE_URL };
  }
}

export function normalizeApiKey(value) {
  if (typeof value !== 'string') {
    throw new SettingsValidationError('The API key must be text.', 'INVALID_API_KEY');
  }
  if (value.length > 4096) {
    throw new SettingsValidationError('The API key is too long.', 'INVALID_API_KEY');
  }
  return value.trim();
}
