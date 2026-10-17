import { SettingsApplication } from './ui/SettingsApplication.js';
import { createStandaloneAdapter } from './adapters/standalone/createStandaloneAdapter.js';
import { injectSpeedInsights } from '@vercel/speed-insights';

const root = document.querySelector('[data-acemusic-app-root]') ?? document.querySelector('#acemusic-app');

// Initialize Vercel Speed Insights
injectSpeedInsights();

function showStartupError() {
  if (!root) return;
  const error = document.createElement('p');
  error.className = 'acemusic-startup-error';
  error.setAttribute('role', 'alert');
  error.textContent = 'AceMusic could not initialize. Refresh the page and try again.';
  root.replaceChildren(error);
}

async function startApplication() {
  if (!root) throw new Error('AceMusic application root was not found.');
  const adapter = createStandaloneAdapter();
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
