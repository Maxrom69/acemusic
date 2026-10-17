import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const generatedPaths = [
  'dist/electron',
  'dist/electron-web',
  'dist/index.html',
  'dist/src',
];

for (const path of generatedPaths) {
  await rm(resolve(projectRoot, path), { recursive: true, force: true });
}
process.stdout.write('Cleaned standalone and Electron build outputs; preserved dist/wordpress.\n');
