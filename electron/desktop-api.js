import { ApiConnectionError, testAceStepConnection } from '../src/core/api/aceStepClient.js';
import { createMusicGenerationClient } from '../src/core/api/musicGenerationClient.js';
import { validateApiTestPayload, validateAudioFetchPayload, validateGenerationPayload, validateModelsPayload, validateTaskQueryPayload } from './ipc-contract.js';

function safeHealthLabel(value, apiKey) {
  if (typeof value !== 'string' || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  if (apiKey && value.includes(apiKey)) return null;
  return value;
}

/** Run the shared API client in Electron's main process, resolving saved keys there. */
export function createDesktopApiClient({ credentialStore, fetchImpl = globalThis.fetch }) {
  if (!credentialStore || typeof credentialStore.getApiKeyForRequest !== 'function') {
    throw new TypeError('The desktop API client requires a main-process credential store.');
  }

  const musicClient = createMusicGenerationClient({ fetchImpl });
  const resolveRequestKey = async (enteredKey) => enteredKey || await credentialStore.getApiKeyForRequest();

  return {
    async testConnection(payload) {
      const { baseUrl, apiKey: enteredKey } = validateApiTestPayload(payload);
      const apiKey = await resolveRequestKey(enteredKey);

      let result;
      try {
        result = await testAceStepConnection({ baseUrl, apiKey, fetchImpl });
      } catch (error) {
        if (error?.code === 'NETWORK_OR_CORS') {
          throw new ApiConnectionError(
            'The desktop app could not reach the API. Check the base URL, network connection, TLS certificate, VPN, and firewall.',
            'NETWORK_UNAVAILABLE',
          );
        }
        throw error;
      }

      const service = safeHealthLabel(result.service, apiKey);
      const version = safeHealthLabel(result.version, apiKey);
      return {
        ok: result.ok === true,
        service: service ?? 'ACE-Step API',
        ...(version ? { version } : {}),
      };
    },

    async listModels(payload) {
      const { baseUrl, apiKey: enteredKey } = validateModelsPayload(payload);
      const apiKey = await resolveRequestKey(enteredKey);
      return musicClient.listModels({ baseUrl, apiKey });
    },

    async submitGeneration(payload) {
      const validated = validateGenerationPayload(payload);
      const apiKey = await resolveRequestKey(validated.apiKey);
      return musicClient.submitGeneration({
        baseUrl: validated.baseUrl,
        apiKey,
        options: validated.options,
        referenceAudio: validated.referenceAudio,
      });
    },

    async queryTasks(payload) {
      const { baseUrl, apiKey: enteredKey, taskIds } = validateTaskQueryPayload(payload);
      const apiKey = await resolveRequestKey(enteredKey);
      return musicClient.queryTasks({ baseUrl, apiKey, taskIds });
    },

    async fetchAudio(payload) {
      const { baseUrl, apiKey: enteredKey, path } = validateAudioFetchPayload(payload);
      const apiKey = await resolveRequestKey(enteredKey);
      return musicClient.fetchAudio({ baseUrl, apiKey, path });
    },
  };
}
