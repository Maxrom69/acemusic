import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_THEME,
  THEME_FIELDS,
} from '../src/core/config/defaults.js';
import {
  isLoopbackUrl,
  normalizeApiBaseUrl,
  normalizeApiKey,
  normalizeHexColor,
  normalizePublicSettings,
  normalizeTheme,
} from '../src/core/config/validation.js';

 test('normalizes API base URL and removes trailing slashes', () => {
  assert.equal(normalizeApiBaseUrl(' https://api.example.test/service/// '), 'https://api.example.test/service');
  assert.equal(normalizeApiBaseUrl('http://localhost:8001/'), 'http://localhost:8001');
});

test('rejects missing, unsafe, and credential-bearing API URLs', () => {
  for (const value of ['', 'not a url', 'ftp://api.example.test', 'https://user:pass@example.test', 'https://example.test/?token=secret', 'https://example.test/#key']) {
    assert.throws(() => normalizeApiBaseUrl(value));
  }
});

test('recognizes loopback only for local HTTP transport allowances', () => {
  assert.equal(isLoopbackUrl('http://localhost:8001'), true);
  assert.equal(isLoopbackUrl('http://127.0.0.1:8001'), true);
  assert.equal(isLoopbackUrl('http://[::1]:8001'), true);
  assert.equal(isLoopbackUrl('http://api.example.test'), false);
});

test('normalizes shorthand and full HEX colors', () => {
  assert.equal(normalizeHexColor('#abc'), '#AABBCC');
  assert.equal(normalizeHexColor('#00a1fF'), '#00A1FF');
  assert.throws(() => normalizeHexColor('rgb(0,0,0)'));
  assert.throws(() => normalizeHexColor('#12'));
});

test('normalizes only known theme tokens and falls back per invalid field', () => {
  const theme = normalizeTheme({ primary: '#abc', accent: 'red', injected: '#000000' });
  assert.equal(theme.primary, '#AABBCC');
  assert.equal(theme.accent, DEFAULT_THEME.accent);
  assert.equal(Object.hasOwn(theme, 'injected'), false);
  assert.equal(Object.keys(theme).length, THEME_FIELDS.length);
});

test('public configuration strips secret-like properties', () => {
  const settings = normalizePublicSettings({ apiBaseUrl: 'https://service.example', apiKey: 'must-not-persist', token: 'secret' });
  assert.deepEqual(settings, { apiBaseUrl: 'https://service.example' });
  assert.equal(DEFAULT_API_BASE_URL, 'https://api.acemusic.ai');
});

test('API keys are trimmed and bounded without being persisted by the model', () => {
  assert.equal(normalizeApiKey('  abc  '), 'abc');
  assert.equal(normalizeApiKey(''), '');
  assert.throws(() => normalizeApiKey('x'.repeat(4097)));
});
