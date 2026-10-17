import {
  DEFAULT_API_BASE_URL,
  DEFAULT_BRANDING_PREFERENCES,
  DEFAULT_LOGO_URL,
  DEFAULT_PUBLIC_SETTINGS,
  DEFAULT_THEME,
  THEME_CSS_VARIABLES,
  THEME_FIELDS,
} from '../core/config/defaults.js';
import {
  normalizeApiBaseUrl,
  normalizeApiKey,
  normalizeHexColor,
  normalizeTheme,
} from '../core/config/validation.js';
import { validateLogoFile } from '../core/config/logoValidation.js';
import { MusicStudio } from './MusicStudio.js';
import { escapeHtml } from './escapeHtml.js';

const GITHUB_URL = 'https://github.com/ace-step/ACE-Step-1.5';

function icon(name) {
  const paths = {
    settings: '<path d="M12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4Z"/><path d="m19.4 13.5 1.1.8-1.1 1.9-1.3-.5a7.9 7.9 0 0 1-1.4.8l-.2 1.4h-2.2l-.3-1.4a7.9 7.9 0 0 1-1.5-.1l-1 1-1.9-1.1.5-1.3a7.8 7.8 0 0 1-.8-1.4l-1.4-.2v-2.2l1.4-.3a7.7 7.7 0 0 1 .2-1.5l-1-1 1.1-1.9 1.3.5a7.8 7.8 0 0 1 1.4-.8l.2-1.4h2.2l.3 1.4a7.7 7.7 0 0 1 1.5.2l1-1 1.9 1.1-.5 1.3a7.8 7.8 0 0 1 .8 1.4l1.4.2v2.2l-1.4.3a7.6 7.6 0 0 1-.2 1.5Z"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17h1.1a2.1 2.1 0 0 0 1.6-3.5 1.2 1.2 0 0 1 .9-2h1.1a3.8 3.8 0 0 0 3.8-3.8c0-4.3-3.8-7.7-8.5-7.7Z"/><path d="M7.5 11.6h.01M10.1 7.8h.01M14.4 7.8h.01M17 10.4h.01" stroke-linecap="round" stroke-width="2.6"/>',
    shield: '<path d="M12 3.5 19 6v5.3c0 4.2-2.9 7.8-7 9.2-4.1-1.4-7-5-7-9.2V6l7-2.5Z"/><path d="m9 12 2 2 4-4"/>',
    eye: '<path d="M2.7 12s3.2-5.3 9.3-5.3 9.3 5.3 9.3 5.3-3.2 5.3-9.3 5.3S2.7 12 2.7 12Z"/><circle cx="12" cy="12" r="2.6"/>',
    eyeOff: '<path d="m3 3 18 18M10.6 6.9a10.5 10.5 0 0 1 1.4-.1c6.1 0 9.3 5.2 9.3 5.2a17.3 17.3 0 0 1-3.2 3.5M6.2 7.1C3.9 8.5 2.7 12 2.7 12s3.2 5.3 9.3 5.3c.7 0 1.3-.1 1.9-.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    reset: '<path d="M4 7v5h5"/><path d="M5.4 16.2A7.5 7.5 0 1 0 4 12"/>',
    upload: '<path d="M12 15V4m0 0L8 8m4-4 4 4"/><path d="M5 13v5h14v-5"/>',
    link: '<path d="M10 13.5 14 9.5M8 15.5l-1.3 1.3a3.5 3.5 0 0 1-5-5l4.2-4.2a3.5 3.5 0 0 1 5 0M16 8.5l1.3-1.3a3.5 3.5 0 0 1 5 5l-4.2 4.2a3.5 3.5 0 0 1-5 0"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    external: '<path d="M14 4h6v6m-.5-5.5L11 13"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`;
}

function renderThemeControls(theme) {
  const groups = [...new Set(THEME_FIELDS.map((field) => field.group))];
  return groups.map((group) => {
    const fields = THEME_FIELDS.filter((field) => field.group === group);
    return `<div class="theme-group">
      <h3>${escapeHtml(group)}</h3>
      <div class="color-grid">${fields.map(({ key, label }) => `
        <div class="color-field">
          <label for="theme-${escapeHtml(key)}">${escapeHtml(label)}</label>
          <div class="color-control">
            <input class="color-picker" type="color" value="${escapeHtml(theme[key])}" data-theme-picker="${escapeHtml(key)}" aria-label="Choose ${escapeHtml(label)} color" />
            <input class="text-input hex-input" id="theme-${escapeHtml(key)}" type="text" value="${escapeHtml(theme[key])}" data-theme-hex="${escapeHtml(key)}" maxlength="7" inputmode="text" autocomplete="off" spellcheck="false" aria-describedby="theme-error-${escapeHtml(key)}" />
          </div>
          <p class="field-error" id="theme-error-${escapeHtml(key)}" data-theme-error="${escapeHtml(key)}" aria-live="polite"></p>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function applicationMarkup(theme, deployment) {
  const isWordPress = deployment?.target === 'wordpress';
  const isElectron = deployment?.target === 'electron';
  const apiKeyHelp = isWordPress
    ? 'The saved key is encrypted on the WordPress server and is never returned to this browser. Leave the field blank to keep it; use “Remove key” to clear it.'
    : isElectron
      ? 'A saved key is encrypted by the operating system in this user profile and is never returned to the renderer. Leave the field blank to keep it; use “Remove key” to clear it.'
      : 'A saved session key is kept in memory. Leave the field blank to keep it; use “Remove key” to clear it.';
  const credentialSecurityCopy = isWordPress
    ? 'WordPress proxies health, models, generation, task status, and audio through same-origin server routes. Saved API credentials are encrypted on the WordPress server and are never returned to browser JavaScript. Only site administrators can use this screen; use HTTPS and protect wp-config.php salts and backups.'
    : isElectron
      ? 'Saved API credentials are encrypted with Electron safeStorage using Windows DPAPI or macOS Keychain; Linux saving requires an unlocked libsecret or KWallet backend. The renderer can check whether a key exists and request its removal, but cannot read the saved value. A key typed for an API operation is sent to the desktop main process for that request and remains in the password field until cleared; it is not saved unless secure storage is available. Use HTTPS for non-loopback APIs.'
      : 'This browser-only build never writes the API key to browser storage or source. It is held in memory for this page and cleared on reload, then sent directly to the configured API for health, model, generation, task, or audio requests. Use HTTPS; hosted multi-user deployments should use an authenticated server-side proxy.';
  const logoStorageCopy = isElectron ? 'stored locally on this device' : 'stored in this browser';
  return `<div class="app-shell" id="app-top">
    <aside class="sidebar" aria-label="Application navigation">
      <a class="brand-lockup" href="#app-top" aria-label="ACE Music settings home">
        <span class="brand-logo-wrap" data-logo-frame>
          <img class="js-logo-image" src="${DEFAULT_LOGO_URL}" alt="ACE Music logo" />
          <span class="brand-logo-fallback js-logo-fallback" hidden>ACE</span>
        </span>
        <span><span class="brand-name">ACE Music</span><span class="brand-caption">AI platform</span></span>
      </a>
      <p class="sidebar-label">Shared settings</p>
      <nav class="sidebar-nav">
        <a href="#api-configuration" aria-current="location">${icon('settings')}<span>API configuration</span></a>
        <a href="#branding-settings">${icon('palette')}<span>Branding &amp; theme</span></a>
      </nav>
      <div class="sidebar-bottom">
        <div class="deployment-note">
          <strong>One shared foundation</strong>
          <p>Web · WordPress · Electron<br />Shared core, separate adapters.</p>
        </div>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div class="breadcrumb">ACE MUSIC <span aria-hidden="true">/</span> SETTINGS</div>
        <div class="topbar-actions">
          <span class="core-chip"><span class="core-chip-dot" aria-hidden="true"></span>Shared application core</span>
          <a href="${GITHUB_URL}" target="_blank" rel="noreferrer">ACE-Step docs ${icon('external')}</a>
        </div>
      </header>

      <div class="page-heading">
        <div>
          <p class="eyebrow">Application foundation</p>
          <h1>Settings</h1>
          <p class="page-subtitle">Configure the shared API connection and brand system that every AceMusic deployment can build on.</p>
        </div>
        <div class="connection-badge" id="connection-badge" data-state="idle" aria-live="polite">Not tested</div>
      </div>

      <div class="content-column">
        <section class="settings-card" id="api-configuration" aria-labelledby="api-heading">
          <div class="card-heading">
            <div class="card-heading-main">
              <span class="heading-icon">${icon('link')}</span>
              <div>
                <h2 id="api-heading">API connection</h2>
                <p>Connect to an ACE-Step REST API. The test uses the documented, read-only health check.</p>
              </div>
            </div>
            <span class="core-chip">REST · GET /health</span>
          </div>

          <form id="api-config-form" novalidate>
            <div class="field-grid">
              <div class="form-field">
                <label for="api-base-url">API base URL</label>
                <input class="text-input" id="api-base-url" name="apiBaseUrl" type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="https://api.acemusic.ai" aria-describedby="api-url-help api-url-error" />
                <p class="field-help" id="api-url-help">Enter the service root, not a specific endpoint. The connection test appends <code>/health</code>.</p>
                <p class="field-error" id="api-url-error" role="alert"></p>
              </div>

              <div class="form-field">
                <label for="api-key">API key <span class="field-help">(optional, if required by the server)</span></label>
                <div class="password-control">
                  <input class="text-input" id="api-key" name="apiKey" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Paste an API key" aria-describedby="api-key-help api-key-error" />
                  <button class="reveal-button" id="toggle-api-key" type="button" aria-label="Show API key" aria-pressed="false">${icon('eye')}</button>
                </div>
                <p class="field-help" id="api-key-help">${escapeHtml(apiKeyHelp)}</p>
                <p class="field-error" id="api-key-error" role="alert"></p>
              </div>
            </div>

            <div class="security-note">${icon('shield')}<span><strong>Credential handling:</strong> ${escapeHtml(credentialSecurityCopy)}</span></div>

            <div class="button-row">
              <button class="button button-primary" id="save-api-config" type="submit">Save Configuration</button>
              <button class="button button-secondary" id="cancel-api-config" type="button">Cancel</button>
              <button class="button button-quiet button-danger" id="remove-api-key" type="button" hidden>Remove key</button>
              <span class="button-spacer"></span>
              <button class="button button-secondary" id="test-api-connection" type="button">${icon('link')}Test Connection</button>
              <button class="button button-quiet" id="reset-api-config" type="button">${icon('reset')}Reset Configuration</button>
            </div>
            <p class="form-status" id="api-save-status" aria-live="polite"></p>
            <div class="api-test-result" id="api-test-result" data-state="idle" role="status" aria-live="polite" hidden>
              <span class="result-indicator" aria-hidden="true"></span>
              <span class="result-copy"><strong id="api-test-title"></strong><span id="api-test-message"></span></span>
            </div>
          </form>
        </section>

        <section class="settings-card" id="branding-settings" aria-labelledby="branding-heading">
          <div class="card-heading">
            <div class="card-heading-main">
              <span class="heading-icon">${icon('palette')}</span>
              <div>
                <h2 id="branding-heading">Branding &amp; theme</h2>
                <p>Adjust the reusable logo and design tokens. Changes preview live; saved preferences apply across the shared interface.</p>
              </div>
            </div>
            <span class="core-chip">${icon('music')} Live preview</span>
          </div>

          <div class="branding-grid">
            <div class="branding-controls">
              <div class="form-field">
                <span class="field-label">Application logo</span>
                <div class="logo-settings">
                  <div class="logo-preview-box" data-logo-frame>
                    <img class="js-logo-image" src="${DEFAULT_LOGO_URL}" alt="Application logo preview" />
                    <span class="logo-fallback js-logo-fallback" hidden>ACE Music</span>
                  </div>
                  <div>
                    <p class="field-help">Choose the logo shown in the shared app header and theme preview. Your original ACE Music logo is never overwritten.</p>
                    <div class="logo-actions">
                      <input class="visually-hidden" id="logo-file" type="file" accept="image/png,image/jpeg" aria-label="Choose a PNG or JPG logo file" />
                      <button class="button button-secondary" id="choose-logo" type="button">${icon('upload')}Upload / replace</button>
                      <button class="button button-quiet" id="reset-logo" type="button">Reset logo</button>
                    </div>
                    <p class="logo-note">PNG or JPG · up to 2 MB · aspect ratio preserved · ${escapeHtml(logoStorageCopy)}</p>
                    <p class="field-error" id="logo-error" role="alert"></p>
                    <p class="form-status" id="logo-status" aria-live="polite"></p>
                  </div>
                </div>
              </div>

              <hr class="section-divider" />
              <div class="theme-groups" id="theme-controls">${renderThemeControls(theme)}</div>
              <div class="button-row">
                <button class="button button-primary" id="save-theme" type="button">Save Theme</button>
                <button class="button button-secondary" id="reset-theme" type="button">${icon('reset')}Reset Theme</button>
              </div>
              <p class="form-status" id="theme-save-status" aria-live="polite"></p>
            </div>

            <aside class="preview-panel" aria-label="Live theme preview">
              <div class="preview-header"><strong>Application preview</strong><span class="preview-live-tag">Live</span></div>
              <div class="preview-stage">
                <div class="preview-brand-row">
                  <span class="brand-logo-wrap" data-logo-frame>
                    <img class="js-logo-image" src="${DEFAULT_LOGO_URL}" alt="Preview logo" />
                    <span class="brand-logo-fallback js-logo-fallback" hidden>ACE</span>
                  </span>
                  <span class="preview-brand-name">ACE Music</span>
                </div>
                <div class="preview-card">
                  <p class="preview-kicker">A shared creative space</p>
                  <h3>Your sound, your space.</h3>
                  <p>Theme colors, surfaces, links, and focus states update together across the application.</p>
                  <span class="preview-button">Primary button</span><a class="preview-link" href="#branding-settings">Text link</a>
                  <div class="preview-swatch-row" aria-hidden="true">
                    <span class="preview-swatch preview-swatch-primary"></span>
                    <span class="preview-swatch preview-swatch-secondary"></span>
                    <span class="preview-swatch preview-swatch-accent"></span>
                    <span class="preview-swatch preview-swatch-surface"></span>
                  </div>
                </div>
                <p class="preview-caption">Illustrative sample only; no music-generation controls are implied.</p>
              </div>
            </aside>
          </div>
        </section>
      </div>

      <div class="toast-region" id="toast-region" aria-live="polite" aria-atomic="true"></div>
    </main>
  </div>`;
}

function setInputError(input, error, message) {
  input?.setAttribute('aria-invalid', error ? 'true' : 'false');
  if (message !== undefined) input?.closest('.form-field, .color-field')?.querySelector('.field-error')?.replaceChildren(document.createTextNode(message));
}

export class SettingsApplication {
  constructor({ root, settingsStore, credentialStore, apiClient, musicClient, deployment }) {
    this.root = root;
    this.settingsStore = settingsStore;
    this.credentialStore = credentialStore;
    this.apiClient = apiClient;
    this.musicClient = musicClient;
    this.deployment = deployment;
    this.musicStudio = null;
    this.publicSettings = { ...DEFAULT_PUBLIC_SETTINGS };
    this.branding = { ...DEFAULT_BRANDING_PREFERENCES, theme: { ...DEFAULT_THEME } };
    this.themeDraft = { ...DEFAULT_THEME };
    this.savedApiKeyPresent = false;
    this.logoBlob = null;
    this.logoObjectUrl = null;
    this.toastTimers = new Set();
    this.activeConnectionController = null;
  }

  async start() {
    const credentialStatePromise = typeof this.credentialStore.hasApiKey === 'function'
      ? this.credentialStore.hasApiKey()
      : this.credentialStore.getApiKey();
    const [publicSettings, branding, logo, apiKey] = await Promise.allSettled([
      this.settingsStore.loadPublicSettings(),
      this.settingsStore.loadBranding(),
      this.settingsStore.loadLogo(),
      credentialStatePromise,
    ]);

    this.publicSettings = publicSettings.status === 'fulfilled'
      ? publicSettings.value
      : { ...DEFAULT_PUBLIC_SETTINGS };
    this.branding = branding.status === 'fulfilled'
      ? branding.value
      : { theme: { ...DEFAULT_BRANDING_PREFERENCES.theme } };
    this.themeDraft = normalizeTheme(this.branding.theme);
    this.logoBlob = logo.status === 'fulfilled' && logo.value instanceof Blob ? logo.value : null;
    this.savedApiKeyPresent = apiKey.status === 'fulfilled' && Boolean(apiKey.value);

    this.root.innerHTML = applicationMarkup(this.themeDraft, this.deployment);
    this.root.dataset.deployment = this.deployment?.target ?? 'standalone-web';
    this.mountStudioWorkspace();
    this.root.querySelector('#api-base-url').value = this.publicSettings.apiBaseUrl;
    this.updateApiKeyIndicator();
    this.applyTheme(this.themeDraft);
    this.populateThemeInputs(this.themeDraft);
    this.setLogo(this.logoBlob);
    this.bindEvents();
    this.musicStudio = new MusicStudio({
      root: this.root.querySelector('#music-studio-view'),
      settingsStore: this.settingsStore,
      musicClient: this.musicClient,
      getRequestConfig: async () => ({
        baseUrl: this.publicSettings.apiBaseUrl,
        apiKey: await this.credentialStore.getApiKey(),
      }),
      statusNode: this.root.querySelector('#studio-api-status'),
    });
    void this.musicStudio.start();

    const failures = [publicSettings, branding, logo, apiKey].filter((result) => result.status === 'rejected');
    if (failures.length) {
      const credentialFailure = this.deployment?.target === 'wordpress' && apiKey.status === 'rejected';
      const message = credentialFailure
        ? `WordPress credential status could not be loaded: ${apiKey.reason?.message ?? 'check administrator access, HTTPS, and the REST API.'}`
        : this.deployment?.target === 'electron'
          ? 'Some saved preferences could not be loaded. Defaults are shown; check this user profile’s storage permissions.'
          : 'Some saved preferences could not be loaded. Defaults are shown; check browser storage permissions.';
      this.showToast(message, 'error');
    }
  }

  mountStudioWorkspace() {
    const shell = this.root.querySelector('.app-shell');
    const main = shell?.querySelector('.main-area');
    if (!shell || !main) throw new Error('The shared AceMusic application shell could not be mounted.');

    shell.querySelector('.sidebar')?.remove();
    main.querySelector('.topbar')?.remove();
    main.querySelector('.page-heading')?.remove();
    const settingsContent = main.querySelector('.content-column');
    const toastRegion = main.querySelector('#toast-region');
    if (!settingsContent || !toastRegion) throw new Error('The shared settings view is incomplete.');

    const appHeader = document.createElement('header');
    appHeader.className = 'studio-appbar';
    appHeader.innerHTML = `<div class="studio-appbar-title"><span class="studio-appbar-mark" aria-hidden="true">♫</span><span><strong>Music Studio</strong><small>PERSONAL WORKSPACE</small></span></div><div class="studio-appbar-actions"><span class="studio-api-indicator" id="studio-api-status" data-state="checking" role="status" aria-live="polite">Connecting to API…</span><button class="studio-settings-button" id="open-settings" type="button" aria-controls="settings-view">${icon('settings')}<span>Settings</span></button></div>`;

    const studioView = document.createElement('section');
    studioView.id = 'music-studio-view';
    studioView.className = 'music-studio-view';
    studioView.setAttribute('aria-label', 'Music Studio');

    const settingsView = document.createElement('section');
    settingsView.id = 'settings-view';
    settingsView.className = 'settings-view';
    settingsView.hidden = true;
    settingsView.setAttribute('aria-labelledby', 'settings-view-heading');
    const settingsHeading = document.createElement('div');
    settingsHeading.className = 'settings-view-heading';
    settingsHeading.innerHTML = `<div><p class="studio-eyebrow">WORKSPACE CONFIGURATION</p><h2 id="settings-view-heading">Settings</h2><p>API configuration, credential handling, branding, and theme controls remain part of the shared application.</p></div><div class="settings-view-actions"><span class="connection-badge" id="connection-badge" data-state="idle" aria-live="polite">Not tested</span><button class="studio-settings-button" id="back-to-studio" type="button" aria-controls="music-studio-view">${icon('music')}<span>Back to Studio</span></button></div>`;
    settingsView.append(settingsHeading, settingsContent);

    main.classList.add('studio-workspace');
    main.replaceChildren(studioView, settingsView, toastRegion);
    shell.replaceChildren(appHeader, main);
  }

  showSettingsView(showSettings) {
    const studio = this.root.querySelector('#music-studio-view');
    const settings = this.root.querySelector('#settings-view');
    const openButton = this.root.querySelector('#open-settings');
    if (!studio || !settings) return;
    studio.hidden = showSettings;
    settings.hidden = !showSettings;
    if (showSettings) this.root.querySelector('#back-to-studio')?.focus();
    else openButton?.focus();
  }

  bindEvents() {
    this.root.querySelector('#open-settings').addEventListener('click', () => this.showSettingsView(true));
    this.root.querySelector('#back-to-studio').addEventListener('click', () => this.showSettingsView(false));
    this.root.querySelector('#api-config-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.saveApiConfiguration();
    });
    this.root.querySelector('#cancel-api-config').addEventListener('click', () => this.cancelApiEdits());
    this.root.querySelector('#reset-api-config').addEventListener('click', () => void this.resetApiConfiguration());
    this.root.querySelector('#remove-api-key').addEventListener('click', () => void this.removeApiKey());
    this.root.querySelector('#test-api-connection').addEventListener('click', () => void this.testConnection());
    this.root.querySelector('#toggle-api-key').addEventListener('click', (event) => this.toggleApiKeyVisibility(event.currentTarget));
    this.root.querySelector('#api-base-url').addEventListener('input', () => this.markApiConfigurationDirty());
    this.root.querySelector('#api-key').addEventListener('input', () => {
      this.root.querySelector('#api-key-error').textContent = '';
      this.root.querySelector('#api-key').setAttribute('aria-invalid', 'false');
      this.markApiConfigurationDirty();
    });

    this.root.querySelector('#choose-logo').addEventListener('click', () => this.root.querySelector('#logo-file').click());
    this.root.querySelector('#logo-file').addEventListener('change', (event) => void this.handleLogoSelection(event.currentTarget));
    this.root.querySelector('#reset-logo').addEventListener('click', () => void this.resetLogo());
    this.root.querySelector('#save-theme').addEventListener('click', () => void this.saveTheme());
    this.root.querySelector('#reset-theme').addEventListener('click', () => void this.resetTheme());

    for (const picker of this.root.querySelectorAll('[data-theme-picker]')) {
      picker.addEventListener('input', () => this.handleThemePicker(picker));
    }
    for (const field of this.root.querySelectorAll('[data-theme-hex]')) {
      field.addEventListener('input', () => this.handleThemeHexInput(field));
      field.addEventListener('blur', () => this.validateThemeHexField(field));
    }

    for (const image of this.root.querySelectorAll('.js-logo-image')) {
      image.addEventListener('load', () => this.showLogoImage(image, true));
      image.addEventListener('error', () => this.showLogoImage(image, false));
    }

    for (const link of this.root.querySelectorAll('.sidebar-nav a')) {
      link.addEventListener('click', () => {
        for (const navLink of this.root.querySelectorAll('.sidebar-nav a')) navLink.removeAttribute('aria-current');
        link.setAttribute('aria-current', 'location');
      });
    }
  }

  updateApiKeyIndicator() {
    const input = this.root.querySelector('#api-key');
    const removeButton = this.root.querySelector('#remove-api-key');
    if (!input || !removeButton) return;
    input.value = '';
    const savedLabel = this.deployment?.target === 'wordpress'
      ? 'saved on WordPress server'
      : this.deployment?.target === 'electron'
        ? 'saved with OS encryption'
        : 'saved this session';
    input.placeholder = this.savedApiKeyPresent ? `•••••••••••• · ${savedLabel}` : 'Paste an API key';
    removeButton.hidden = !this.savedApiKeyPresent;
  }

  markApiConfigurationDirty() {
    const status = this.root.querySelector('#api-save-status');
    status.textContent = 'Unsaved changes';
    status.dataset.tone = 'warning';
    this.root.querySelector('#api-test-result').hidden = true;
    this.setConnectionBadge('idle', 'Not tested');
    this.clearApiUrlError();
  }

  async saveApiConfiguration() {
    const urlInput = this.root.querySelector('#api-base-url');
    const keyInput = this.root.querySelector('#api-key');
    let apiBaseUrl;
    let apiKey;

    try {
      apiBaseUrl = normalizeApiBaseUrl(urlInput.value);
      apiKey = normalizeApiKey(keyInput.value);
      await this.settingsStore.savePublicSettings({ apiBaseUrl });
      if (apiKey) await this.credentialStore.setApiKey(apiKey);
    } catch (error) {
      if (error?.code === 'INVALID_URL' || error?.code === 'URL_CREDENTIALS') {
        this.setApiUrlError(error.message);
        urlInput.focus();
        return;
      }
      if (error?.code === 'INVALID_API_KEY') {
        keyInput.setAttribute('aria-invalid', 'true');
        this.root.querySelector('#api-key-error').textContent = error.message;
        keyInput.focus();
        return;
      }
      this.setFormStatus('#api-save-status', error?.message ?? 'Configuration could not be saved.', 'error');
      this.showToast(error?.message ?? 'Configuration could not be saved.', 'error');
      return;
    }

    this.publicSettings = { apiBaseUrl };
    this.savedApiKeyPresent = Boolean(apiKey) || this.savedApiKeyPresent;
    urlInput.value = apiBaseUrl;
    keyInput.value = '';
    keyInput.setAttribute('aria-invalid', 'false');
    this.root.querySelector('#api-key-error').textContent = '';
    this.updateApiKeyIndicator();
    this.setFormStatus(
      '#api-save-status',
      this.savedApiKeyPresent
        ? this.deployment?.target === 'wordpress'
          ? 'API URL and preferences saved in this browser; the API key is encrypted on the WordPress server.'
          : this.deployment?.target === 'electron'
            ? 'Settings saved on this device. The API key is encrypted with OS credential storage.'
            : 'Configuration saved in this browser. The API key remains in memory only.'
        : this.deployment?.target === 'electron'
          ? 'Settings saved on this device.'
          : 'Configuration saved in this browser.',
      'success',
    );
    this.setApiUrlError('');
    this.setConnectionBadge('idle', 'Not tested');
    void this.musicStudio?.refreshConfiguration();
    this.showToast('API configuration saved.', 'success');
  }

  cancelApiEdits() {
    const urlInput = this.root.querySelector('#api-base-url');
    const keyInput = this.root.querySelector('#api-key');
    urlInput.value = this.publicSettings.apiBaseUrl;
    keyInput.value = '';
    keyInput.setAttribute('aria-invalid', 'false');
    this.root.querySelector('#api-key-error').textContent = '';
    this.updateApiKeyIndicator();
    this.setApiUrlError('');
    this.setFormStatus('#api-save-status', 'Unsaved changes cancelled.', '');
    this.root.querySelector('#api-test-result').hidden = true;
    this.setConnectionBadge('idle', 'Not tested');
  }

  async resetApiConfiguration() {
    const credentialPrompt = this.deployment?.target === 'wordpress'
      ? 'Reset the API base URL and remove the saved WordPress API key?'
      : this.deployment?.target === 'electron'
        ? 'Reset the API base URL and remove the OS-encrypted API key?'
        : 'Reset the API base URL and remove the session API key?';
    if (!globalThis.confirm?.(credentialPrompt)) return;
    try {
      await this.settingsStore.savePublicSettings(DEFAULT_PUBLIC_SETTINGS);
      await this.credentialStore.clearApiKey();
    } catch (error) {
      this.setFormStatus('#api-save-status', error?.message ?? 'Configuration could not be reset.', 'error');
      return;
    }

    this.publicSettings = { ...DEFAULT_PUBLIC_SETTINGS };
    this.savedApiKeyPresent = false;
    this.root.querySelector('#api-base-url').value = DEFAULT_API_BASE_URL;
    this.root.querySelector('#api-key').value = '';
    this.root.querySelector('#api-key-error').textContent = '';
    this.root.querySelector('#api-key').setAttribute('aria-invalid', 'false');
    this.updateApiKeyIndicator();
    this.setApiUrlError('');
    this.setFormStatus('#api-save-status', 'API configuration reset to the default.', 'success');
    this.root.querySelector('#api-test-result').hidden = true;
    this.setConnectionBadge('idle', 'Not tested');
    void this.musicStudio?.refreshConfiguration();
    this.showToast('API configuration reset.', 'success');
  }

  async removeApiKey() {
    const credentialPrompt = this.deployment?.target === 'wordpress'
      ? 'Remove the saved API key from the WordPress server?'
      : this.deployment?.target === 'electron'
        ? 'Remove the OS-encrypted API key from this user profile?'
        : 'Remove the API key held in this browser session?';
    if (!globalThis.confirm?.(credentialPrompt)) return;
    try {
      await this.credentialStore.clearApiKey();
    } catch (error) {
      this.showToast(error?.message ?? 'The API key could not be removed.', 'error');
      return;
    }
    this.savedApiKeyPresent = false;
    this.root.querySelector('#api-key').value = '';
    this.root.querySelector('#api-key-error').textContent = '';
    this.root.querySelector('#api-key').setAttribute('aria-invalid', 'false');
    this.updateApiKeyIndicator();
    this.root.querySelector('#api-test-result').hidden = true;
    this.setConnectionBadge('idle', 'Not tested');
    void this.musicStudio?.refreshConfiguration();
    const removedMessage = this.deployment?.target === 'wordpress'
      ? 'Saved WordPress API key removed.'
      : this.deployment?.target === 'electron'
        ? 'OS-encrypted API key removed.'
        : 'Session API key removed.';
    this.setFormStatus('#api-save-status', removedMessage, 'success');
    this.showToast(removedMessage, 'success');
  }

  toggleApiKeyVisibility(button) {
    const input = this.root.querySelector('#api-key');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    button.setAttribute('aria-pressed', String(!showing));
    button.setAttribute('aria-label', showing ? 'Show API key' : 'Hide API key');
    button.innerHTML = icon(showing ? 'eye' : 'eyeOff');
  }

  async testConnection() {
    const button = this.root.querySelector('#test-api-connection');
    const urlInput = this.root.querySelector('#api-base-url');
    const enteredKey = this.root.querySelector('#api-key').value;
    let baseUrl;
    let apiKey;

    try {
      baseUrl = normalizeApiBaseUrl(urlInput.value);
      apiKey = normalizeApiKey(enteredKey);
      if (!apiKey) apiKey = await this.credentialStore.getApiKey();
      this.setApiUrlError('');
      this.root.querySelector('#api-key-error').textContent = '';
      this.root.querySelector('#api-key').setAttribute('aria-invalid', 'false');
    } catch (error) {
      if (error?.code === 'INVALID_API_KEY') {
        const keyInput = this.root.querySelector('#api-key');
        keyInput.setAttribute('aria-invalid', 'true');
        this.root.querySelector('#api-key-error').textContent = error.message;
        this.setConnectionBadge('error', 'Invalid API key');
        this.showConnectionResult('error', 'Connection test not sent', error.message);
        keyInput.focus();
        return;
      }
      this.setApiUrlError(error.message);
      this.setConnectionBadge('error', 'Invalid URL');
      this.showConnectionResult('error', 'Connection test not sent', error.message);
      urlInput.focus();
      return;
    }

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span>Testing…';
    this.setConnectionBadge('checking', 'Testing…');
    this.musicStudio?.setConnectionState('checking', 'Testing API health…');
    this.showConnectionResult('checking', 'Checking API health', 'Sending the documented GET /health request…');

    try {
      const result = await this.apiClient.testConnection({ baseUrl, apiKey });
      const version = result.version ? ` · v${result.version}` : '';
      this.setConnectionBadge('success', 'Connected');
      this.musicStudio?.setConnectionState('success', 'API connected');
      this.showConnectionResult('success', 'ACE-Step API is healthy', `${result.service}${version} · documented health response received.`);
      void this.musicStudio?.refreshConfiguration();
    } catch (error) {
      const message = error?.message ?? 'The connection test failed for an unknown reason.';
      this.setConnectionBadge('error', 'Connection issue');
      this.musicStudio?.setConnectionState('error', 'API unavailable');
      this.showConnectionResult('error', 'Could not verify the API connection', message);
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = `${icon('link')}Test Connection`;
    }
  }

  setApiUrlError(message) {
    const input = this.root.querySelector('#api-base-url');
    const error = this.root.querySelector('#api-url-error');
    error.textContent = message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  clearApiUrlError() {
    this.setApiUrlError('');
  }

  setConnectionBadge(state, label) {
    const badge = this.root.querySelector('#connection-badge');
    badge.dataset.state = state;
    badge.textContent = label;
  }

  showConnectionResult(state, title, message) {
    const result = this.root.querySelector('#api-test-result');
    result.dataset.state = state;
    result.hidden = false;
    this.root.querySelector('#api-test-title').textContent = title;
    this.root.querySelector('#api-test-message').textContent = message;
  }

  setFormStatus(selector, message, tone = '') {
    const status = this.root.querySelector(selector);
    status.textContent = message;
    if (tone) status.dataset.tone = tone;
    else status.removeAttribute('data-tone');
  }

  showToast(message, tone = 'success') {
    const region = this.root.querySelector('#toast-region');
    if (!region) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.tone = tone;
    toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    toast.textContent = message;
    region.append(toast);
    const timer = setTimeout(() => {
      toast.remove();
      this.toastTimers.delete(timer);
    }, 4200);
    this.toastTimers.add(timer);
  }

  populateThemeInputs(theme) {
    for (const field of this.root.querySelectorAll('[data-theme-hex]')) {
      const key = field.dataset.themeHex;
      field.value = theme[key];
      field.setAttribute('aria-invalid', 'false');
      this.root.querySelector(`[data-theme-picker="${key}"]`).value = theme[key];
      this.root.querySelector(`[data-theme-error="${key}"]`).textContent = '';
    }
  }

  applyTheme(theme) {
    const normalized = normalizeTheme(theme);
    for (const [key, variable] of Object.entries(THEME_CSS_VARIABLES)) {
      this.root.style.setProperty(variable, normalized[key]);
    }
  }

  handleThemePicker(picker) {
    const key = picker.dataset.themePicker;
    const normalized = normalizeHexColor(picker.value);
    this.themeDraft[key] = normalized;
    const textInput = this.root.querySelector(`[data-theme-hex="${key}"]`);
    textInput.value = normalized;
    setInputError(textInput, false, '');
    this.applyTheme(this.themeDraft);
    this.setFormStatus('#theme-save-status', 'Unsaved theme changes · preview updated live.', 'warning');
  }

  handleThemeHexInput(input) {
    const key = input.dataset.themeHex;
    try {
      const normalized = normalizeHexColor(input.value);
      this.themeDraft[key] = normalized;
      this.root.querySelector(`[data-theme-picker="${key}"]`).value = normalized;
      setInputError(input, false, '');
      this.applyTheme(this.themeDraft);
      this.setFormStatus('#theme-save-status', 'Unsaved theme changes · preview updated live.', 'warning');
    } catch {
      setInputError(input, true, 'Use a HEX value such as #6757DE.');
    }
  }

  validateThemeHexField(input) {
    try {
      const normalized = normalizeHexColor(input.value);
      input.value = normalized;
      this.themeDraft[input.dataset.themeHex] = normalized;
      setInputError(input, false, '');
    } catch {
      setInputError(input, true, 'Use a HEX value such as #6757DE.');
    }
  }

  async saveTheme() {
    const fields = [...this.root.querySelectorAll('[data-theme-hex]')];
    let firstInvalid = null;
    const nextTheme = { ...this.themeDraft };

    for (const field of fields) {
      try {
        nextTheme[field.dataset.themeHex] = normalizeHexColor(field.value);
        setInputError(field, false, '');
      } catch {
        setInputError(field, true, 'Use a HEX value such as #6757DE.');
        firstInvalid ??= field;
      }
    }
    if (firstInvalid) {
      firstInvalid.focus();
      this.setFormStatus('#theme-save-status', 'Fix the highlighted HEX value before saving.', 'error');
      return;
    }

    const button = this.root.querySelector('#save-theme');
    button.disabled = true;
    try {
      await this.settingsStore.saveBranding({ theme: nextTheme });
      this.themeDraft = normalizeTheme(nextTheme);
      this.branding = { theme: { ...this.themeDraft } };
      this.populateThemeInputs(this.themeDraft);
      this.applyTheme(this.themeDraft);
      this.setFormStatus(
        '#theme-save-status',
        this.deployment?.target === 'electron' ? 'Theme saved on this device.' : 'Theme saved in this browser.',
        'success',
      );
      this.showToast('Theme saved.', 'success');
    } catch (error) {
      this.setFormStatus('#theme-save-status', error?.message ?? 'Theme could not be saved.', 'error');
      this.showToast(error?.message ?? 'Theme could not be saved.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async resetTheme() {
    if (!globalThis.confirm?.('Reset all theme colors to the default palette?')) return;
    const button = this.root.querySelector('#reset-theme');
    button.disabled = true;
    try {
      await this.settingsStore.saveBranding({ theme: DEFAULT_THEME });
      this.themeDraft = { ...DEFAULT_THEME };
      this.branding = { theme: { ...DEFAULT_THEME } };
      this.populateThemeInputs(this.themeDraft);
      this.applyTheme(this.themeDraft);
      this.setFormStatus('#theme-save-status', 'Theme reset to the default palette.', 'success');
      this.showToast('Theme reset.', 'success');
    } catch (error) {
      this.setFormStatus('#theme-save-status', error?.message ?? 'Theme could not be reset.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async handleLogoSelection(input) {
    const [file] = input.files ?? [];
    input.value = '';
    if (!file) return;

    const errorNode = this.root.querySelector('#logo-error');
    errorNode.textContent = '';
    try {
      await validateLogoFile(file);
      await this.settingsStore.saveLogo(file);
      this.setLogo(file);
      this.setFormStatus(
        '#logo-status',
        this.deployment?.target === 'electron' ? 'Custom logo saved on this device.' : 'Custom logo saved in this browser.',
        'success',
      );
      this.showToast('Logo uploaded and saved.', 'success');
    } catch (error) {
      errorNode.textContent = error?.message ?? 'The selected logo could not be saved.';
      this.setFormStatus('#logo-status', '', '');
    }
  }

  async resetLogo() {
    if (!globalThis.confirm?.('Restore the original ACE Music logo?')) return;
    try {
      await this.settingsStore.saveLogo(null);
      this.setLogo(null);
      this.setFormStatus('#logo-status', 'Original ACE Music logo restored.', 'success');
      this.root.querySelector('#logo-error').textContent = '';
      this.showToast('Original logo restored.', 'success');
    } catch (error) {
      this.root.querySelector('#logo-error').textContent = error?.message ?? 'The logo could not be reset.';
    }
  }

  setLogo(blob) {
    if (this.logoObjectUrl) URL.revokeObjectURL(this.logoObjectUrl);
    this.logoObjectUrl = blob ? URL.createObjectURL(blob) : null;
    this.logoBlob = blob;
    const source = this.logoObjectUrl ?? DEFAULT_LOGO_URL;
    for (const image of this.root.querySelectorAll('.js-logo-image')) {
      image.hidden = false;
      const fallback = image.closest('[data-logo-frame]')?.querySelector('.js-logo-fallback');
      if (fallback) fallback.hidden = true;
      image.src = source;
      if (image.complete) this.showLogoImage(image, image.naturalWidth > 0);
    }
  }

  showLogoImage(image, isAvailable) {
    const fallback = image.closest('[data-logo-frame]')?.querySelector('.js-logo-fallback');
    image.hidden = !isAvailable;
    if (fallback) fallback.hidden = isAvailable;
  }
}
