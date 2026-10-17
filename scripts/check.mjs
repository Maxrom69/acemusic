import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceRoots = ['src', 'electron', 'scripts', 'tests'];
const sourceFiles = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) sourceFiles.push(path);
  }
}

for (const root of sourceRoots) await collect(resolve(projectRoot, root));
for (const file of sourceFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: projectRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
}

const tests = spawnSync(process.execPath, ['--test'], { cwd: projectRoot, stdio: 'inherit' });
process.exit(tests.status ?? 1);
