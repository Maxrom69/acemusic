import { DEFAULT_DEPLOYMENT_SETTINGS } from '../../core/config/defaults.js';
import { testAceStepConnection } from '../../core/api/aceStepClient.js';
import { createMusicGenerationClient } from '../../core/api/musicGenerationClient.js';
import { MemoryCredentialStore } from '../../core/storage/MemoryCredentialStore.js';
import { BrowserSettingsStore } from './BrowserSettingsStore.js';

/** Compose the web-specific adapters around the framework-free shared core. */
export function createStandaloneAdapter() {
  return {
    settingsStore: new BrowserSettingsStore(),
    credentialStore: new MemoryCredentialStore(),
    apiClient: { testConnection: testAceStepConnection },
    musicClient: createMusicGenerationClient(),
    deployment: DEFAULT_DEPLOYMENT_SETTINGS,
  };
}
