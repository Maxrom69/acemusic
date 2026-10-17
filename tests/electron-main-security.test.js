import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mainSource = await readFile(resolve(projectRoot, 'electron/main.js'), 'utf8');
const packageManifest = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));

test('Electron renderer disables Node integration and enables isolation, sandbox, and web security', () => {
  assert.match(mainSource, /nodeIntegration:\s*false/);
  assert.match(mainSource, /contextIsolation:\s*true/);
  assert.match(mainSource, /sandbox:\s*true/);
  assert.match(mainSource, /webSecurity:\s*true/);
  assert.match(mainSource, /allowRunningInsecureContent:\s*false/);
  assert.match(mainSource, /will-navigate/);
  assert.match(mainSource, /will-redirect/);
  assert.match(mainSource, /setWindowOpenHandler/);
  assert.match(mainSource, /setPermissionRequestHandler/);
  assert.match(mainSource, /https:\/\/github\.com\/ace-step\/ACE-Step-1\.5/);
});

test('Windows packaging uses the versioned app identity, icon, user-scope installer, and portable target', () => {
  assert.equal(packageManifest.version, '0.2.0');
  assert.equal(packageManifest.build.productName, 'AceMusic AI');
  assert.equal(packageManifest.build.appId, 'ai.acemusic.settings');
  assert.equal(packageManifest.build.win.icon, 'build/icon.ico');
  assert.deepEqual(packageManifest.build.win.target.map((target) => target.target).sort(), ['nsis', 'portable']);
  assert.equal(packageManifest.build.nsis.perMachine, false);
  assert.equal(packageManifest.build.nsis.deleteAppDataOnUninstall, false);
  assert.equal(packageManifest.scripts['electron:win:installer'].includes('--win nsis --x64'), true);
  assert.equal(packageManifest.scripts['electron:win:portable'].includes('--win portable --x64'), true);
});
