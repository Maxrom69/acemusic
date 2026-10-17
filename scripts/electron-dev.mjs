import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(import.meta.url);
const runtimePathFile = resolve(projectRoot, 'node_modules/electron/path.txt');
let electronBinary;
if (!existsSync(runtimePathFile)) {
  process.stderr.write('Electron is not installed. Run npm run deps:install with access to the Electron release download host.\n');
  process.exitCode = 1;
} else {
  try {
    electronBinary = require('electron');
  } catch {
    process.stderr.write('Electron is not installed correctly. Run npm run deps:install with access to the Electron release download host.\n');
    process.exitCode = 1;
  }
}

if (!process.exitCode && (typeof electronBinary !== 'string' || !existsSync(electronBinary))) {
  process.stderr.write('The Electron runtime binary is missing. Run npm run deps:install with access to the Electron release download host.\n');
  process.exitCode = 1;
}

if (!process.exitCode) {
  const child = spawn(electronBinary, ['.'], {
    cwd: projectRoot,
    env: { ...process.env, ACEMUSIC_OPEN_DEVTOOLS: '1' },
    stdio: 'inherit',
    windowsHide: false,
  });
  child.on('error', (error) => {
    process.stderr.write(`Could not start Electron: ${error.message}\n`);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  }
}
