import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const pluginPath = resolve(root, 'wordpress-plugin/acemusic-ai/acemusic-ai.php');

 test('WordPress plugin exposes a preferred music-studio shortcode and keeps the legacy alias', async () => {
  const source = await readFile(pluginPath, 'utf8');
  assert.match(source, /add_shortcode\('acemusic_ai_music_studio'/);
  assert.match(source, /add_shortcode\('acemusic_ai_app'/);
  assert.match(source, /has_shortcode\(\$content, 'acemusic_ai_music_studio'\)/);
  assert.match(source, /manage_options/);
  assert.match(source, /wp_create_nonce\('wp_rest'\)/);
  assert.match(source, /assets\/web\/src\/styles\/studio\.css/);
});

test('WordPress proxy routes are fixed, administrator-only, and include real generation, status, and audio paths', async () => {
  const source = await readFile(pluginPath, 'utf8');
  for (const route of ['/music/models', '/music/generate', '/music/query', '/music/audio']) {
    assert.ok(source.includes(`'${route}'`), `Missing WordPress REST route ${route}`);
  }
  assert.match(source, /'v1\/models'/);
  assert.match(source, /'release_task'/);
  assert.match(source, /'query_result'/);
  assert.match(source, /'v1\/audio'/);
  assert.match(source, /\$headers\['Authorization'\]\s*=\s*'Bearer '\s*\./);
  assert.match(source, /X-AceMusic-Upstream-Response/);
  assert.match(source, /private, no-store/);
  assert.doesNotMatch(source, /<iframe\b/i);
});
