import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const electronDirectory = resolve(projectRoot, 'node_modules/electron');
const pathFile = resolve(electronDirectory, 'path.txt');

if (!existsSync(pathFile)) {
  process.stderr.write('Electron npm package is present, but its runtime binary is missing. Check access to the Electron release download host and rerun npm run deps:install.\n');
  process.exitCode = 1;
} else {
  const relativeBinaryPath = readFileSync(pathFile, 'utf8').trim();
  const binaryPath = resolve(electronDirectory, 'dist', relativeBinaryPath);
  if (
    !relativeBinaryPath ||
    !binaryPath.startsWith(`${resolve(electronDirectory, 'dist')}${sep}`) ||
    !existsSync(binaryPath)
  ) {
    process.stderr.write('Electron runtime verification failed: the package binary path is invalid or missing. Rerun npm run deps:install.\n');
    process.exitCode = 1;
  } else {
    const { version } = JSON.parse(readFileSync(resolve(electronDirectory, 'package.json'), 'utf8'));
    process.stdout.write(`Electron ${version} runtime verified at ${binaryPath}\n`);
  }
}
