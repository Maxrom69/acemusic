import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDirectory = resolve(projectRoot, 'dist');
const applicationOutput = resolve(outputDirectory, 'src');

await mkdir(outputDirectory, { recursive: true });
await rm(resolve(outputDirectory, 'index.html'), { force: true });
await rm(applicationOutput, { recursive: true, force: true });
await cp(resolve(projectRoot, 'index.html'), resolve(outputDirectory, 'index.html'));

const sourceRoot = resolve(projectRoot, 'src');
for (const directory of ['core', 'ui', 'styles', 'adapters/standalone']) {
  const destination = resolve(applicationOutput, directory);
  await mkdir(dirname(destination), { recursive: true });
  await cp(resolve(sourceRoot, directory), destination, { recursive: true });
}
await cp(resolve(sourceRoot, 'standalone.js'), resolve(applicationOutput, 'standalone.js'));
process.stdout.write(`Standalone application written to ${outputDirectory}\n`);
