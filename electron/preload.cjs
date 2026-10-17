'use strict';

const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel, payload) {
  let response;
  try {
    response = await ipcRenderer.invoke(channel, payload);
  } catch {
    throw Object.assign(new Error('The desktop bridge could not complete this operation.'), {
      code: 'DESKTOP_BRIDGE_UNAVAILABLE',
    });
  }

  if (!response || response.__acemusicDesktopIpc !== true || typeof response.ok !== 'boolean') {
    throw Object.assign(new Error('The desktop bridge returned an invalid response.'), {
      code: 'DESKTOP_BRIDGE_UNAVAILABLE',
    });
  }
  if (!response.ok) {
    const details = response.error && typeof response.error === 'object' ? response.error : {};
    const error = new Error(typeof details.message === 'string' ? details.message : 'The desktop operation failed.');
    error.code = typeof details.code === 'string' ? details.code : 'DESKTOP_OPERATION_FAILED';
    if (Number.isInteger(details.status)) error.status = details.status;
    if (typeof details.retryAfter === 'string') error.retryAfter = details.retryAfter;
    throw error;
  }
  return response.value;
}

const credentials = Object.freeze({
  hasApiKey: async () => (await invoke('acemusic:credentials:has-api-key')).hasApiKey === true,
  setApiKey: (apiKey) => invoke('acemusic:credentials:save-api-key', { apiKey }),
  clearApiKey: () => invoke('acemusic:credentials:clear-api-key'),
});

const api = Object.freeze({
  testConnection: (options) => invoke('acemusic:api:test-connection', options),
  listModels: (options) => invoke('acemusic:api:list-models', options),
  submitGeneration: (options) => invoke('acemusic:api:submit-generation', options),
  queryTasks: (options) => invoke('acemusic:api:query-tasks', options),
  fetchAudio: (options) => invoke('acemusic:api:fetch-audio', options),
});

contextBridge.exposeInMainWorld('acemusicDesktop', Object.freeze({ credentials, api }));
