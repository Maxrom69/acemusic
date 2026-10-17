import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));

 test('static entrypoint mounts only the scoped AceMusic root and loads native styles', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  assert.match(html, /id="acemusic-app"/);
  assert.match(html, /\.\/src\/styles\/layout\.css/);
  assert.match(html, /\.\/src\/styles\/studio\.css/);
  assert.match(html, /AceMusic AI · Music Studio/);
  assert.match(html, /type="module" src="\.\/src\/standalone\.js"/);
  assert.doesNotMatch(html, /<script[^>]+>[^<]*api[_-]?key/i);
});

test('standalone production output excludes WordPress and Electron deployment adapters', async () => {
  const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const output = resolve(root, 'dist');
  const exists = async (path) => {
    try { await access(path); return true; } catch { return false; }
  };
  assert.equal(await exists(resolve(output, 'src/standalone.js')), true);
  assert.equal(await exists(resolve(output, 'src/core/api/aceStepClient.js')), true);
  assert.equal(await exists(resolve(output, 'src/core/api/musicGenerationClient.js')), true);
  assert.equal(await exists(resolve(output, 'src/ui/MusicStudio.js')), true);
  assert.equal(await exists(resolve(output, 'src/adapters/wordpress')), false);
  assert.equal(await exists(resolve(output, 'src/adapters/electron')), false);
});

test('application styles remain scoped and do not add page-wide element selectors', async () => {
  const css = await Promise.all(['layout.css', 'app.css', 'studio.css'].map((name) => readFile(resolve(root, `src/styles/${name}`), 'utf8'))).then((parts) => parts.join('\n'));
  assert.doesNotMatch(css, /(^|\n)\s*(?:body|html|button|input)\s*\{/);
  assert.match(css, /\.acemusic-app\s*\{/);
  assert.doesNotMatch(css, /(^|\n)\s*(?:\.site-header|\.wp-admin-bar)\s*\{/);
  const studioCss = await readFile(resolve(root, 'src/styles/studio.css'), 'utf8');
  assert.doesNotMatch(studioCss, /font(?:-size)?\s*:\s*(?:[1-9]|10)px\b/);
});
