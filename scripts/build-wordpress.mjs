import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourcePlugin = resolve(projectRoot, 'wordpress-plugin/acemusic-ai');
const wordpressOutput = resolve(projectRoot, 'dist/wordpress');
const pluginOutput = resolve(wordpressOutput, 'acemusic-ai');
const archivePath = resolve(wordpressOutput, 'acemusic-ai.zip');
const sourceApplication = resolve(projectRoot, 'src');

try {
  await stat(sourcePlugin);
} catch {
  throw new Error('WordPress plugin sources are missing.');
}

await rm(wordpressOutput, { recursive: true, force: true });
await mkdir(pluginOutput, { recursive: true });
await cp(sourcePlugin, pluginOutput, { recursive: true });
const applicationOutput = resolve(pluginOutput, 'assets/web/src');
await mkdir(applicationOutput, { recursive: true });
for (const directory of ['core', 'ui', 'styles', 'adapters/standalone', 'adapters/wordpress']) {
  await cp(resolve(sourceApplication, directory), resolve(applicationOutput, directory), { recursive: true });
}
await cp(resolve(sourceApplication, 'main.js'), resolve(applicationOutput, 'main.js'));

for (const relativePath of [
  'assets/web/src/main.js',
  'assets/web/src/ui/MusicStudio.js',
  'assets/web/src/core/api/musicGenerationClient.js',
  'assets/web/src/styles/studio.css',
]) {
  try {
    await stat(resolve(pluginOutput, relativePath));
  } catch {
    throw new Error(`WordPress build is missing a required Music Studio asset: ${relativePath}`);
  }
}

try {
  execFileSync('zip', ['-qr', archivePath, 'acemusic-ai'], { cwd: wordpressOutput, stdio: 'inherit' });
} catch (error) {
  throw new Error('Could not create the WordPress ZIP. Install the zip command, then run npm run build:wordpress again.', { cause: error });
}

process.stdout.write(`WordPress plugin directory: ${pluginOutput}\n`);
process.stdout.write(`WordPress install package: ${archivePath}\n`);
