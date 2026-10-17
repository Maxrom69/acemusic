import { SettingsApplication } from './ui/SettingsApplication.js';
import { createElectronAdapter } from './adapters/electron/createElectronAdapter.js';
import { injectSpeedInsights } from '@vercel/speed-insights';

const root = document.querySelector('#acemusic-app');

// Initialize Vercel Speed Insights (primarily for web deployments)
injectSpeedInsights();

function showStartupError() {
  if (!root) return;
  const error = document.createElement('p');
  error.className = 'acemusic-startup-error';
  error.setAttribute('role', 'alert');
  error.textContent = 'AceMusic could not initialize. Restart the desktop app or reinstall it.';
  root.replaceChildren(error);
}

async function startApplication() {
  if (!root) throw new Error('AceMusic application root was not found.');
  root.dataset.deployment = 'electron';
  const adapter = createElectronAdapter();
  const application = new SettingsApplication({
    root,
    settingsStore: adapter.settingsStore,
    credentialStore: adapter.credentialStore,
    apiClient: adapter.apiClient,
    musicClient: adapter.musicClient,
    deployment: adapter.deployment,
  });
  await application.start();
}

startApplication().catch(showStartupError);
