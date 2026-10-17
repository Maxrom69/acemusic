import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDirectory = resolve(projectRoot, 'dist/electron-web');
const htmlPath = resolve(projectRoot, 'index.html');
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https://acemusic.ai data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ');

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
let html = await readFile(htmlPath, 'utf8');
if (!html.includes('src="./src/standalone.js"')) {
  throw new Error('The standalone application entry point was not found in index.html.');
}
html = html
  .replace('src="./src/standalone.js"', 'src="./src/electron.js"')
  .replace('</head>', `    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />\n  </head>`);
await writeFile(resolve(outputDirectory, 'index.html'), html);

const sharedSource = resolve(projectRoot, 'src');
const requiredDirectories = ['core', 'ui', 'styles', 'adapters/standalone', 'adapters/electron'];
for (const directory of requiredDirectories) {
  const destination = resolve(outputDirectory, 'src', directory);
  await mkdir(dirname(destination), { recursive: true });
  await cp(resolve(sharedSource, directory), destination, { recursive: true });
}
await mkdir(resolve(outputDirectory, 'src'), { recursive: true });
await cp(resolve(sharedSource, 'electron.js'), resolve(outputDirectory, 'src/electron.js'));

process.stdout.write(`Electron renderer assets written to ${outputDirectory}\n`);
