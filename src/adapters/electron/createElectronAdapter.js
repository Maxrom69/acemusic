import { DEFAULT_DEPLOYMENT_SETTINGS } from '../../core/config/defaults.js';
import { BrowserSettingsStore } from '../standalone/BrowserSettingsStore.js';

export class ElectronBridgeError extends Error {
  constructor(message, code = 'DESKTOP_BRIDGE_UNAVAILABLE') {
    super(message);
    this.name = 'ElectronBridgeError';
    this.code = code;
  }
}

export class ElectronCredentialStore {
  constructor(bridge) {
    this.bridge = bridge;
  }

  // Saved keys are resolved only in Electron's main process and never returned.
  async getApiKey() {
    return '';
  }

  async hasApiKey() {
    return this.bridge.credentials.hasApiKey();
  }

  async setApiKey(value) {
    return this.bridge.credentials.setApiKey(value);
  }

  async clearApiKey() {
    return this.bridge.credentials.clearApiKey();
  }
}

function requireBridge(bridge) {
  if (
    !bridge ||
    typeof bridge.credentials?.hasApiKey !== 'function' ||
    typeof bridge.credentials?.setApiKey !== 'function' ||
    typeof bridge.credentials?.clearApiKey !== 'function' ||
    typeof bridge.api?.testConnection !== 'function' ||
    typeof bridge.api?.listModels !== 'function' ||
    typeof bridge.api?.submitGeneration !== 'function' ||
    typeof bridge.api?.queryTasks !== 'function' ||
    typeof bridge.api?.fetchAudio !== 'function'
  ) {
    throw new ElectronBridgeError('The AceMusic desktop security bridge is unavailable. Restart the application or reinstall it.');
  }
  return bridge;
}

/** Compose the shared renderer UI with a narrow, secret-safe preload bridge. */
export function createElectronAdapter({
  bridge = globalThis.acemusicDesktop,
  storage,
  indexedDBRef,
} = {}) {
  const desktopBridge = requireBridge(bridge);
  return {
    settingsStore: new BrowserSettingsStore({ storage, indexedDBRef }),
    credentialStore: new ElectronCredentialStore(desktopBridge),
    apiClient: {
      testConnection({ baseUrl, apiKey }) {
        return desktopBridge.api.testConnection({ baseUrl, apiKey });
      },
    },
    musicClient: {
      listModels(options) {
        return desktopBridge.api.listModels(options);
      },
      async submitGeneration(options) {
        const { referenceAudio, ...payload } = options;
        let fileTransfer;
        if (referenceAudio) {
          const bytes = new Uint8Array(await referenceAudio.arrayBuffer());
          fileTransfer = { name: referenceAudio.name, type: referenceAudio.type || 'application/octet-stream', bytes };
        }
        return desktopBridge.api.submitGeneration({ ...payload, ...(fileTransfer ? { referenceAudio: fileTransfer } : {}) });
      },
      queryTasks(options) {
        return desktopBridge.api.queryTasks(options);
      },
      fetchAudio(options) {
        return desktopBridge.api.fetchAudio(options);
      },
    },
    deployment: Object.freeze({
      ...DEFAULT_DEPLOYMENT_SETTINGS,
      target: 'electron',
      apiAccess: 'electron-main-process',
    }),
  };
}
