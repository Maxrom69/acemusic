import { app, BrowserWindow, ipcMain, safeStorage, session, shell } from 'electron';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDesktopApiClient } from './desktop-api.js';
import { registerIpcHandlers } from './ipc.js';
import { SecureCredentialStore } from './secure-credential-store.js';

const applicationDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)));
const preloadFile = resolve(applicationDirectory, 'preload.cjs');
const rendererFile = resolve(app.getAppPath(), 'dist/electron-web/index.html');
const rendererUrl = app.isPackaged ? null : validateDevelopmentUrl(process.env.ACEMUSIC_RENDERER_URL);
const ALLOWED_EXTERNAL_DOCS = new URL('https://github.com/ace-step/ACE-Step-1.5');
let mainWindow = null;

function openAllowedExternalUrl(value) {
  let url;
  try { url = new URL(value); } catch { return false; }
  if (
    url.protocol !== 'https:' ||
    url.origin !== ALLOWED_EXTERNAL_DOCS.origin ||
    url.pathname !== ALLOWED_EXTERNAL_DOCS.pathname ||
    url.username !== '' || url.password !== '' || url.search || url.hash
  ) return false;
  void shell.openExternal(url.toString()).catch(() => {});
  return true;
}

function handleWindowOpen(value) {
  openAllowedExternalUrl(value);
  return { action: 'deny' };
}

function validateDevelopmentUrl(value) {
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { throw new Error('ACEMUSIC_RENDERER_URL must be a local development URL.'); }
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search || url.hash
  ) {
    throw new Error('The Electron development renderer must use a loopback HTTP origin and the root path.');
  }
  return url.toString().replace(/\/$/, '');
}

function isAllowedRendererUrl(value) {
  let url;
  try { url = new URL(value); } catch { return false; }

  if (rendererUrl) {
    const expected = new URL(rendererUrl);
    return url.protocol === 'http:'
      && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && url.origin === expected.origin;
  }
  if (url.protocol !== 'file:') return false;
  try { return resolve(fileURLToPath(url)) === rendererFile; } catch { return false; }
}

async function createMainWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 600,
    show: false,
    backgroundColor: '#080b18',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadFile,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
    },
  });
  mainWindow = window;

  const credentialStore = new SecureCredentialStore({
    safeStorage,
    userDataPath: app.getPath('userData'),
  });
  const apiClient = createDesktopApiClient({ credentialStore });
  const unregisterIpc = registerIpcHandlers({
    ipcMain,
    mainWindow: window,
    credentialStore,
    apiClient,
    rendererFile,
    developmentUrl: rendererUrl,
  });
  window.on('closed', () => {
    unregisterIpc();
    if (mainWindow === window) mainWindow = null;
  });

  window.webContents.setWindowOpenHandler(({ url }) => handleWindowOpen(url));
  window.webContents.on('will-navigate', (event, destination) => {
    if (!isAllowedRendererUrl(destination)) event.preventDefault();
  });
  window.webContents.on('will-redirect', (event, destination) => {
    if (!isAllowedRendererUrl(destination)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  if (rendererUrl) await window.loadURL(rendererUrl);
  else await window.loadFile(rendererFile);
  if (!app.isPackaged && process.env.ACEMUSIC_OPEN_DEVTOOLS === '1') {
    window.webContents.openDevTools({ mode: 'detach' });
  }
  window.show();
  return window;
}

app.setAppUserModelId('ai.acemusic.settings');
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => handleWindowOpen(url));
});

await app.whenReady();
session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
session.defaultSession.setPermissionCheckHandler(() => false);
await createMainWindow();

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) await createMainWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
