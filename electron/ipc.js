import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  IPC_CHANNELS,
  serializeIpcError,
  validateApiTestPayload,
  validateAudioFetchPayload,
  validateCredentialPayload,
  validateGenerationPayload,
  validateModelsPayload,
  validateNoIpcPayload,
  validateTaskQueryPayload,
} from './ipc-contract.js';

function successEnvelope(handler) {
  return async (event, payload) => {
    try {
      if (!handler.isTrustedSender(event)) {
        throw Object.assign(new Error('This operation is only available to the AceMusic app window.'), { code: 'UNTRUSTED_RENDERER' });
      }
      return { __acemusicDesktopIpc: true, ok: true, value: await handler.run(payload) };
    } catch (error) {
      return { __acemusicDesktopIpc: true, ok: false, error: serializeIpcError(error) };
    }
  };
}

export function isTrustedMainFrame(event, mainWindow, { rendererFile, developmentUrl } = {}) {
  if (!mainWindow || event?.sender !== mainWindow.webContents) return false;
  const frame = event.senderFrame;
  if (!frame || frame !== mainWindow.webContents.mainFrame || typeof frame.url !== 'string') return false;

  let actual;
  try {
    actual = new URL(frame.url);
  } catch {
    return false;
  }

  if (developmentUrl) {
    let expected;
    try { expected = new URL(developmentUrl); } catch { return false; }
    return actual.protocol === 'http:'
      && ['127.0.0.1', 'localhost', '[::1]'].includes(actual.hostname)
      && actual.origin === expected.origin
      && actual.username === ''
      && actual.password === '';
  }

  if (actual.protocol !== 'file:' || typeof rendererFile !== 'string') return false;
  try {
    return resolve(fileURLToPath(actual)) === resolve(rendererFile);
  } catch {
    return false;
  }
}

export function registerIpcHandlers({ ipcMain, mainWindow, credentialStore, apiClient, rendererFile, developmentUrl }) {
  if (!ipcMain || !mainWindow || !credentialStore || !apiClient) {
    throw new TypeError('IPC setup requires Electron, the app window, credential store, and API client.');
  }

  const isTrustedSender = (event) => isTrustedMainFrame(event, mainWindow, { rendererFile, developmentUrl });
  const handlers = new Map([
    [IPC_CHANNELS.HAS_API_KEY, {
      isTrustedSender,
      run: async (payload) => {
        validateNoIpcPayload(payload);
        return { hasApiKey: await credentialStore.hasApiKey() };
      },
    }],
    [IPC_CHANNELS.SAVE_API_KEY, {
      isTrustedSender,
      run: async (payload) => {
        const { apiKey } = validateCredentialPayload(payload);
        await credentialStore.setApiKey(apiKey);
        return { saved: true };
      },
    }],
    [IPC_CHANNELS.CLEAR_API_KEY, {
      isTrustedSender,
      run: async (payload) => {
        validateNoIpcPayload(payload);
        await credentialStore.clearApiKey();
        return { cleared: true };
      },
    }],
    [IPC_CHANNELS.TEST_API_CONNECTION, {
      isTrustedSender,
      run: async (payload) => apiClient.testConnection(validateApiTestPayload(payload)),
    }],
    [IPC_CHANNELS.LIST_MODELS, {
      isTrustedSender,
      run: async (payload) => apiClient.listModels(validateModelsPayload(payload)),
    }],
    [IPC_CHANNELS.SUBMIT_GENERATION, {
      isTrustedSender,
      run: async (payload) => apiClient.submitGeneration(validateGenerationPayload(payload)),
    }],
    [IPC_CHANNELS.QUERY_TASKS, {
      isTrustedSender,
      run: async (payload) => apiClient.queryTasks(validateTaskQueryPayload(payload)),
    }],
    [IPC_CHANNELS.FETCH_AUDIO, {
      isTrustedSender,
      run: async (payload) => apiClient.fetchAudio(validateAudioFetchPayload(payload)),
    }],
  ]);

  for (const [channel, handler] of handlers) {
    ipcMain.handle(channel, successEnvelope(handler));
  }
  return () => {
    for (const channel of handlers.keys()) ipcMain.removeHandler(channel);
  };
}
