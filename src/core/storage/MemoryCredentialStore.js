/**
 * In-memory-only credential adapter for the browser-only standalone build.
 * Replace this adapter with the platform secure store or a server-side proxy
 * before persisting credentials in a hosted deployment.
 */
export class MemoryCredentialStore {
  #apiKey = '';

  async getApiKey() {
    return this.#apiKey;
  }

  async hasApiKey() {
    return Boolean(this.#apiKey);
  }

  async setApiKey(value) {
    if (typeof value !== 'string') throw new TypeError('API key must be a string.');
    this.#apiKey = value;
  }

  async clearApiKey() {
    this.#apiKey = '';
  }
}
