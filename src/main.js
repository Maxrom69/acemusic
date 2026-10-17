import { SettingsApplication } from './ui/SettingsApplication.js';

const root = document.querySelector('[data-acemusic-app-root]') ?? document.querySelector('#acemusic-app');

function showStartupError(message) {
  if (!root) return;
  const error = document.createElement('p');
  error.className = 'acemusic-startup-error';
  error.setAttribute('role', 'alert');
  error.textContent = message;
  root.replaceChildren(error);
}

async function startApplication() {
  if (!root) throw new Error('AceMusic application root was not found.');

  let adapter;
  if (root.dataset.deployment === 'wordpress') {
    const { createWordPressAdapter } = await import('./adapters/wordpress/createWordPressAdapter.js');
    adapter = createWordPressAdapter(root);
  } else {
    const { createStandaloneAdapter } = await import('./adapters/standalone/createStandaloneAdapter.js');
    adapter = createStandaloneAdapter();
  }

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

startApplication().catch(() => {
  showStartupError('AceMusic could not initialize. Refresh the page or check the deployment configuration.');
});
