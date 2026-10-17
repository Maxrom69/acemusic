import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rendererDirectory = resolve(projectRoot, 'dist/electron-web');

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

test('Electron renderer build uses the shared UI with an Electron-only bootstrap and CSP', async () => {
  const result = spawnSync(process.execPath, ['scripts/build-electron-web.mjs'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const html = await readFile(resolve(rendererDirectory, 'index.html'), 'utf8');
  assert.match(html, /src="\.\/src\/electron\.js"/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src &#39;self&#39;|connect-src 'self'/);
  assert.equal(await exists(resolve(rendererDirectory, 'src/ui/SettingsApplication.js')), true);
  assert.equal(await exists(resolve(rendererDirectory, 'src/ui/MusicStudio.js')), true);
  assert.equal(await exists(resolve(rendererDirectory, 'src/core/api/aceStepClient.js')), true);
  assert.equal(await exists(resolve(rendererDirectory, 'src/core/api/musicGenerationClient.js')), true);
  assert.equal(await exists(resolve(rendererDirectory, 'src/styles/studio.css')), true);
  assert.equal(await exists(resolve(rendererDirectory, 'src/adapters/electron/createElectronAdapter.js')), true);
  assert.equal(await exists(resolve(rendererDirectory, 'src/adapters/wordpress')), false);
  assert.equal(html.includes('wordpress.css'), false);
});
