import { MAX_REFERENCE_AUDIO_BYTES } from '../core/api/musicGenerationClient.js';
import { normalizeApiBaseUrl } from '../core/config/validation.js';
import { escapeHtml } from './escapeHtml.js';

const HISTORY_LIMIT = 40;
const POLL_INTERVAL_MS = 6000;
const MODEL_PLACEHOLDER = 'Use the API default model';

function studioMarkup() {
  return `<div class="music-studio">
    <div class="studio-intro">
      <div>
        <p class="studio-eyebrow">PERSONAL MUSIC STUDIO</p>
        <h1>Create a track</h1>
        <p class="studio-intro-copy">Shape the sound with a prompt, add lyrics or an optional audio reference, then generate and manage real tracks from your ACE-Step API.</p>
      </div>
      <div class="studio-connection-copy" id="studio-model-status" role="status" aria-live="polite">Loading models from the configured API…</div>
    </div>

    <div class="studio-columns">
      <section class="studio-panel studio-create-panel" aria-labelledby="studio-create-heading">
        <div class="studio-panel-heading">
          <div>
            <p class="studio-section-kicker">NEW GENERATION</p>
            <h2 id="studio-create-heading">Build your sound</h2>
          </div>
          <span class="studio-live-tag"><span aria-hidden="true"></span>ACE-Step</span>
        </div>

        <form id="music-generation-form" novalidate>
          <div class="studio-field">
            <label for="music-prompt">Prompt and style</label>
            <textarea id="music-prompt" name="prompt" rows="4" maxlength="4000" required placeholder="Describe the genre, mood, instruments, rhythm, arrangement, and production. For example: Dreamy synth-pop with glassy arpeggios, warm analog bass, crisp live drums, and a slow-building cinematic chorus."></textarea>
            <div class="studio-field-footer"><span>Be specific about the sound you want; the prompt is sent to the configured API.</span><span id="prompt-count">0 / 4000</span></div>
          </div>

          <div class="studio-fields-row">
            <div class="studio-field studio-field-model">
              <label for="music-model">Model</label>
              <select id="music-model" name="model" aria-describedby="music-model-help">
                <option value="">${MODEL_PLACEHOLDER}</option>
              </select>
              <p class="studio-field-help" id="music-model-help">Choices are loaded from the API’s <code>/v1/models</code> endpoint. No model list is hardcoded.</p>
            </div>
            <label class="studio-toggle-card" for="instrumental-mode">
              <span class="studio-toggle-copy"><strong>Instrumental</strong><span>Send an empty lyrics field.</span></span>
              <input id="instrumental-mode" type="checkbox" />
              <span class="studio-switch" aria-hidden="true"></span>
            </label>
          </div>

          <div class="studio-field" id="lyrics-field">
            <label for="music-lyrics">Lyrics <span>(optional)</span></label>
            <textarea id="music-lyrics" name="lyrics" rows="5" maxlength="12000" placeholder="Add lyrics, section markers, or leave empty for instrumental music. The API receives the text exactly as entered."></textarea>
            <p class="studio-field-help" id="lyrics-mode-note">For instrumental requests, lyrics are omitted from the generated vocal content by sending an empty lyrics field.</p>
          </div>

          <div class="studio-reference-upload">
            <div class="studio-reference-title"><div><label for="reference-audio">Reference audio <span>(optional)</span></label><p>Use an audio reference for style guidance where supported by the API.</p></div><span class="studio-upload-mark" aria-hidden="true">↥</span></div>
            <input id="reference-audio" type="file" accept="audio/*,.mp3,.wav,.flac,.ogg,.oga,.m4a,.aac,.mp4,.webm" />
            <div class="studio-file-row" id="reference-file-row" hidden><span id="reference-file-name"></span><button class="studio-text-button" id="remove-reference-audio" type="button">Remove</button></div>
            <p class="studio-field-help">The documented multipart <code>reference_audio</code> field is used. Maximum 25 MB; MP3, WAV, FLAC, OGG, M4A, AAC, or WebM.</p>
          </div>

          <details class="studio-advanced-options">
            <summary><span>Advanced options</span><span class="studio-summary-hint">Duration, tempo, key, seed and format</span></summary>
            <div class="studio-advanced-grid">
              <div class="studio-field"><label for="audio-duration">Duration <span>(seconds)</span></label><input id="audio-duration" type="number" min="10" max="600" step="1" placeholder="API default" inputmode="decimal" /><p class="studio-field-help">ACE-Step range: 10–600 seconds.</p></div>
              <div class="studio-field"><label for="music-bpm">Tempo <span>(BPM)</span></label><input id="music-bpm" type="number" min="30" max="300" step="1" placeholder="API default" inputmode="numeric" /></div>
              <div class="studio-field"><label for="music-key">Key</label><input id="music-key" type="text" maxlength="16" placeholder="e.g. C major" autocomplete="off" /></div>
              <div class="studio-field"><label for="music-time-signature">Time signature</label><select id="music-time-signature"><option value="">API default</option><option value="2/4">2/4</option><option value="3/4">3/4</option><option value="4/4">4/4</option><option value="6/8">6/8</option></select></div>
              <div class="studio-field"><label for="audio-format">Audio format</label><select id="audio-format"><option value="mp3">MP3</option><option value="wav">WAV</option><option value="flac">FLAC</option><option value="ogg">OGG</option></select></div>
              <div class="studio-field"><label for="inference-steps">Inference steps</label><input id="inference-steps" type="number" min="1" max="200" step="1" placeholder="API default" inputmode="numeric" /></div>
              <div class="studio-field"><label for="guidance-scale">Guidance scale</label><input id="guidance-scale" type="number" min="0" max="20" step="0.1" placeholder="API default" inputmode="decimal" /></div>
              <label class="studio-toggle-card studio-advanced-toggle" for="thinking-mode"><span class="studio-toggle-copy"><strong>Thinking mode</strong><span>Use the API’s thinking option.</span></span><input id="thinking-mode" type="checkbox" checked /><span class="studio-switch" aria-hidden="true"></span></label>
              <label class="studio-toggle-card studio-advanced-toggle" for="random-seed"><span class="studio-toggle-copy"><strong>Random seed</strong><span>Use a new API-generated seed.</span></span><input id="random-seed" type="checkbox" checked /><span class="studio-switch" aria-hidden="true"></span></label>
              <div class="studio-field" id="seed-field" hidden><label for="music-seed">Seed</label><input id="music-seed" type="number" min="0" max="2147483647" step="1" placeholder="0" inputmode="numeric" /></div>
              <label class="studio-toggle-card studio-advanced-toggle" for="use-format"><span class="studio-toggle-copy"><strong>Use format mode</strong><span>Pass the documented API format flag.</span></span><input id="use-format" type="checkbox" /><span class="studio-switch" aria-hidden="true"></span></label>
            </div>
          </details>

          <div class="studio-submit-area">
            <p class="studio-request-note" id="generation-status" role="status" aria-live="polite">Your API configuration is used for generation. No audio or success result is simulated.</p>
            <button class="studio-generate-button" id="generate-track" type="submit"><span aria-hidden="true">✦</span><span>Generate track</span></button>
          </div>
        </form>
      </section>

      <aside class="studio-panel studio-tracks-panel" aria-labelledby="my-tracks-heading">
        <div class="studio-panel-heading studio-tracks-heading">
          <div><p class="studio-section-kicker">YOUR LIBRARY</p><h2 id="my-tracks-heading">My Tracks</h2></div>
          <div class="studio-track-actions"><button class="studio-icon-button" id="refresh-tracks" type="button" aria-label="Refresh task status" title="Refresh task status">↻</button><button class="studio-text-button" id="clear-track-history" type="button">Clear</button></div>
        </div>
        <p class="studio-library-note">Track metadata is saved in this browser or desktop profile. Audio is fetched from your API when you choose Play or Download.</p>
        <div class="studio-history-status" id="track-history-status" role="status" aria-live="polite"></div>
        <div class="studio-track-list" id="track-list"></div>
      </aside>
    </div>
    <p class="studio-disclaimer">Generation, model discovery, task status, and audio delivery are provided by the API you configure. AceMusic does not fabricate results or store your API key in studio history.</p>
  </div>`;
}

function statusLabel(status) {
  if (status === 'running') return 'Processing';
  if (status === 'succeeded') return 'Ready';
  if (status === 'failed') return 'Failed';
  return 'Queued';
}

function clippedPrompt(value) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return text.length > 94 ? `${text.slice(0, 91)}…` : text || 'Untitled generation';
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
    : 'Recent generation';
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

function makeFilename(value) {
  const name = typeof value === 'string' ? value.replace(/[^\w.-]/g, '_').slice(0, 120) : '';
  return name && /\.[a-z\d]{2,5}$/i.test(name) ? name : 'acemusic-track.mp3';
}

export class MusicStudio {
  constructor({ root, settingsStore, musicClient, getRequestConfig, statusNode }) {
    this.root = root;
    this.settingsStore = settingsStore;
    this.musicClient = musicClient;
    this.getRequestConfig = getRequestConfig;
    this.statusNode = statusNode;
    this.history = [];
    this.models = [];
    this.modelRefreshId = 0;
    this.pollTimer = null;
    this.polling = false;
    this.lastPollError = '';
    this.pollFailureCount = 0;
    this.audioCache = new Map();
    this.audioLoading = new Set();
    this.selectedReference = null;
    this.started = false;
  }

  async start() {
    if (!this.root || typeof this.musicClient?.listModels !== 'function') return;
    this.root.innerHTML = studioMarkup();
    this.bindEvents();
    this.started = true;
    try {
      this.history = await this.settingsStore.loadMusicHistory();
    } catch {
      this.history = [];
      this.setHistoryStatus('Local track history could not be loaded.');
    }
    this.renderTracks();
    void this.refreshConfiguration();
    this.schedulePolling();
  }

  bindEvents() {
    this.root.querySelector('#music-generation-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submitGeneration();
    });
    this.root.querySelector('#music-prompt').addEventListener('input', () => this.updatePromptCount());
    this.root.querySelector('#instrumental-mode').addEventListener('change', () => this.updateInstrumentalMode());
    this.root.querySelector('#reference-audio').addEventListener('change', (event) => this.selectReferenceAudio(event.currentTarget));
    this.root.querySelector('#remove-reference-audio').addEventListener('click', () => this.removeReferenceAudio());
    this.root.querySelector('#random-seed').addEventListener('change', () => {
      this.root.querySelector('#seed-field').hidden = this.root.querySelector('#random-seed').checked;
    });
    this.root.querySelector('#refresh-tracks').addEventListener('click', () => {
      void this.refreshConfiguration().then(() => this.pollActiveTasks(true));
    });
    this.root.querySelector('#clear-track-history').addEventListener('click', () => void this.clearHistory());
    this.root.querySelector('#track-list').addEventListener('click', (event) => {
      const button = event.target.closest('[data-load-audio]');
      if (button) void this.loadTrackAudio(button.dataset.taskId, Number(button.dataset.outputIndex), button);
    });
    this.updatePromptCount();
  }

  async getConfig(baseUrlOverride) {
    const config = await this.getRequestConfig();
    const baseUrl = normalizeApiBaseUrl(baseUrlOverride ?? config?.baseUrl);
    return { baseUrl, apiKey: typeof config?.apiKey === 'string' ? config.apiKey : '' };
  }

  async refreshConfiguration() {
    const requestId = ++this.modelRefreshId;
    this.setConnectionState('checking', 'Loading API models…');
    this.setModelStatus('Loading model list from the configured ACE-Step API…', 'loading');
    const select = this.root.querySelector('#music-model');
    if (select) select.disabled = true;
    try {
      const config = await this.getConfig();
      this.currentBaseUrl = config.baseUrl;
      this.renderTracks();
      const result = await this.musicClient.listModels(config);
      if (requestId !== this.modelRefreshId || !this.started) return;
      this.models = result.models;
      this.renderModelSelect(result.defaultModel);
      const count = this.models.length;
      this.setConnectionState('success', 'API connected');
      this.setModelStatus(count ? `Connected. ${count} model${count === 1 ? '' : 's'} available from the API.` : 'API connected. No selectable models were returned; generation will use the API default.', count ? 'success' : 'notice');
    } catch (error) {
      if (requestId !== this.modelRefreshId || !this.started) return;
      this.models = [];
      this.renderModelSelect(null);
      this.setConnectionState('error', 'API unavailable');
      this.setModelStatus(`${error?.message ?? 'The API model list could not be loaded.'} Model selection is unavailable; the server default can still be used if the API accepts generation requests.`, 'error');
    } finally {
      if (requestId === this.modelRefreshId && select?.isConnected) select.disabled = false;
    }
  }

  renderModelSelect(defaultModel) {
    const select = this.root.querySelector('#music-model');
    if (!select) return;
    const selected = select.value;
    const placeholder = this.root.ownerDocument.createElement('option');
    placeholder.value = '';
    placeholder.textContent = MODEL_PLACEHOLDER;
    select.replaceChildren(placeholder);
    for (const model of this.models) {
      const option = this.root.ownerDocument.createElement('option');
      option.value = model.name;
      option.textContent = model.name === defaultModel || model.isDefault ? `${model.name} · default` : model.name;
      select.add(option);
    }
    if (this.models.some((model) => model.name === selected)) select.value = selected;
    else select.value = '';
  }

  setConnectionState(state, message) {
    if (!this.statusNode) return;
    this.statusNode.dataset.state = state;
    this.statusNode.textContent = message;
    this.statusNode.title = message;
  }

  setModelStatus(message, state = '') {
    const node = this.root.querySelector('#studio-model-status');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  setHistoryStatus(message, tone = '') {
    const node = this.root.querySelector('#track-history-status');
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = tone;
  }

  updatePromptCount() {
    const prompt = this.root.querySelector('#music-prompt');
    const count = this.root.querySelector('#prompt-count');
    if (prompt && count) count.textContent = `${prompt.value.length} / 4000`;
  }

  updateInstrumentalMode() {
    const instrumental = this.root.querySelector('#instrumental-mode').checked;
    const lyrics = this.root.querySelector('#music-lyrics');
    const note = this.root.querySelector('#lyrics-mode-note');
    lyrics.disabled = instrumental;
    if (instrumental) {
      note.textContent = 'Instrumental mode sends an empty lyrics field; the API has no separate instrumental flag in this request.';
    } else {
      note.textContent = 'Lyrics are sent to the API exactly as entered; leave empty for instrumental music.';
    }
  }

  selectReferenceAudio(input) {
    const [file] = input.files ?? [];
    if (!file) return;
    if (file.size > MAX_REFERENCE_AUDIO_BYTES) {
      this.setGenerationStatus('Reference audio exceeds the 25 MB upload limit.', 'error');
      input.value = '';
      return;
    }
    this.selectedReference = file;
    this.root.querySelector('#reference-file-name').textContent = `${file.name} · ${formatBytes(file.size)}`;
    this.root.querySelector('#reference-file-row').hidden = false;
    this.setGenerationStatus('Reference audio selected. It will be sent as reference_audio with your generation request.', '');
  }

  removeReferenceAudio() {
    this.selectedReference = null;
    this.root.querySelector('#reference-audio').value = '';
    this.root.querySelector('#reference-file-row').hidden = true;
    this.root.querySelector('#reference-file-name').textContent = '';
  }

  collectOptions() {
    const value = (selector) => this.root.querySelector(selector).value;
    const randomSeed = this.root.querySelector('#random-seed').checked;
    return {
      prompt: value('#music-prompt'),
      lyrics: this.root.querySelector('#instrumental-mode').checked ? '' : value('#music-lyrics'),
      model: value('#music-model'),
      audioDuration: value('#audio-duration'),
      bpm: value('#music-bpm'),
      keyScale: value('#music-key'),
      timeSignature: value('#music-time-signature'),
      audioFormat: value('#audio-format'),
      inferenceSteps: value('#inference-steps'),
      guidanceScale: value('#guidance-scale'),
      thinking: this.root.querySelector('#thinking-mode').checked,
      useFormat: this.root.querySelector('#use-format').checked,
      ...(randomSeed ? {} : { seed: value('#music-seed') }),
    };
  }

  async submitGeneration() {
    const form = this.root.querySelector('#music-generation-form');
    if (!form.reportValidity()) return;
    const button = this.root.querySelector('#generate-track');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = '<span class="studio-spinner" aria-hidden="true"></span><span>Submitting…</span>';
    this.setGenerationStatus('Sending a real generation request to the configured API…', 'loading');
    this.setHistoryStatus('Submitting generation…');

    try {
      const config = await this.getConfig();
      const result = await this.musicClient.submitGeneration({
        ...config,
        options: this.collectOptions(),
        referenceAudio: this.selectedReference ?? undefined,
      });
      const record = {
        taskId: result.taskId,
        baseUrl: config.baseUrl,
        prompt: this.root.querySelector('#music-prompt').value.trim().slice(0, 240),
        createdAt: new Date().toISOString(),
        status: 'queued',
        queuePosition: result.queuePosition,
        outputs: [],
        error: '',
      };
      this.history = [record, ...this.history.filter((entry) => entry.taskId !== record.taskId || entry.baseUrl !== record.baseUrl)].slice(0, HISTORY_LIMIT);
      await this.persistHistory();
      this.renderTracks();
      this.setGenerationStatus(`The API accepted the request. Task ${result.taskId} is queued; status will update from the API.`, 'success');
      this.setHistoryStatus('Generation task submitted to the API.');
      this.schedulePolling();
    } catch (error) {
      this.setGenerationStatus(error?.message ?? 'The API generation request failed. No track was added to history.', 'error');
      this.setHistoryStatus('Generation request failed.', 'error');
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = '<span aria-hidden="true">✦</span><span>Generate track</span>';
    }
  }

  setGenerationStatus(message, state = '') {
    const node = this.root.querySelector('#generation-status');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  async persistHistory() {
    try {
      this.history = await this.settingsStore.saveMusicHistory(this.history.slice(0, HISTORY_LIMIT));
    } catch {
      this.setHistoryStatus('Task is active, but local history could not be saved in this profile.', 'error');
    }
  }

  renderTracks() {
    const list = this.root.querySelector('#track-list');
    if (!list) return;
    if (!this.history.length) {
      list.innerHTML = '<div class="studio-empty-state"><span class="studio-empty-icon" aria-hidden="true">♫</span><strong>No tracks yet</strong><p>Submit a generation request to see its task status and returned audio here.</p></div>';
      return;
    }

    list.innerHTML = this.history.map((record) => {
      const title = clippedPrompt(record.prompt);
      const outputMarkup = record.status === 'succeeded'
        ? record.outputs?.length
          ? record.outputs.map((output, index) => {
            const audioKey = `${record.taskId}:${index}`;
            const cached = this.audioCache.get(audioKey);
            const loading = this.audioLoading.has(audioKey);
            const model = output.metadata?.model ?? output.metadata?.dit_model ?? '';
            const audioMarkup = cached
              ? `<audio class="studio-audio-player" controls preload="none" src="${escapeHtml(cached.url)}" aria-label="Playback for ${escapeHtml(title)}"></audio><a class="studio-download-link" href="${escapeHtml(cached.url)}" download="${escapeHtml(cached.filename)}">Download audio</a>`
              : `<button class="studio-play-button" type="button" data-load-audio data-task-id="${escapeHtml(record.taskId)}" data-output-index="${index}" ${loading || !this.isCurrentApi(record.baseUrl) ? 'disabled' : ''}>${loading ? 'Loading audio…' : 'Load playback'}</button>${!this.isCurrentApi(record.baseUrl) ? '<span class="studio-old-api-note">Reconnect to this track’s API in Settings to load audio.</span>' : ''}`;
            return `<div class="studio-output-item"><div class="studio-output-meta"><strong>Output ${index + 1}</strong>${model ? `<span>${escapeHtml(model)}</span>` : ''}</div>${audioMarkup}</div>`;
          }).join('')
          : '<p class="studio-track-note">API reported completion, but no audio file path was returned.</p>'
        : record.status === 'failed'
          ? `<p class="studio-track-note studio-track-error">${escapeHtml(record.error || 'The API reported that this generation failed.')}</p>`
          : `<p class="studio-track-note">Task status will refresh from the API.${Number.isInteger(record.queuePosition) ? ` Queue position: ${record.queuePosition}.` : ''}</p>`;
      return `<article class="studio-track-card" data-status="${escapeHtml(record.status)}">
        <div class="studio-track-topline"><span class="studio-track-status" data-status="${escapeHtml(record.status)}">${escapeHtml(statusLabel(record.status))}</span><time>${escapeHtml(formatDate(record.createdAt))}</time></div>
        <h3>${escapeHtml(title)}</h3>
        <p class="studio-track-task">Task ID <span>${escapeHtml(record.taskId)}</span></p>
        ${outputMarkup}
      </article>`;
    }).join('');
  }

  isCurrentApi(baseUrl) {
    try { return normalizeApiBaseUrl(baseUrl) === normalizeApiBaseUrl(this.currentBaseUrl); } catch { return false; }
  }

  async loadTrackAudio(taskId, outputIndex, button) {
    const record = this.history.find((entry) => entry.taskId === taskId);
    const output = record?.outputs?.[outputIndex];
    if (!record || !output || !this.isCurrentApi(record.baseUrl)) return;
    const audioKey = `${taskId}:${outputIndex}`;
    if (this.audioCache.has(audioKey) || this.audioLoading.has(audioKey)) return;
    this.audioLoading.add(audioKey);
    button.disabled = true;
    button.textContent = 'Loading audio…';
    try {
      const config = await this.getConfig(record.baseUrl);
      const audio = await this.musicClient.fetchAudio({ ...config, path: output.path });
      const blob = new Blob([audio.bytes], { type: audio.contentType || 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      this.audioCache.set(audioKey, { url, filename: makeFilename(audio.filename), contentType: audio.contentType });
      this.setHistoryStatus('Generated audio loaded from the API. Use the player or download link.', 'success');
    } catch (error) {
      this.setHistoryStatus(error?.message ?? 'The generated audio could not be loaded from the API.', 'error');
    } finally {
      this.audioLoading.delete(audioKey);
      this.renderTracks();
    }
  }

  async pollActiveTasks(showResult = false) {
    if (this.polling) return;
    let currentConfig;
    try { currentConfig = await this.getConfig(); } catch { return; }
    const active = this.history.filter((record) => ['queued', 'running'].includes(record.status) && record.baseUrl === currentConfig.baseUrl);
    if (!active.length) {
      if (showResult) this.setHistoryStatus('No active tasks for the configured API.');
      this.schedulePolling();
      return;
    }

    this.polling = true;
    if (showResult) this.setHistoryStatus('Checking task status with the API…');
    try {
      const results = await this.musicClient.queryTasks({
        ...currentConfig,
        taskIds: active.map((record) => record.taskId),
      });
      const byId = new Map(results.map((result) => [result.taskId, result]));
      let changed = false;
      this.history = this.history.map((record) => {
        const result = record.baseUrl === currentConfig.baseUrl ? byId.get(record.taskId) : null;
        if (!result) return record;
        changed = true;
        return {
          ...record,
          status: result.status,
          outputs: result.status === 'succeeded' ? result.outputs : [],
          error: result.status === 'failed' ? result.error : '',
          queuePosition: null,
        };
      });
      if (changed) {
        await this.persistHistory();
        this.renderTracks();
        this.setHistoryStatus('Task status updated from the API.', 'success');
      } else if (showResult) {
        this.setHistoryStatus('The API did not return status records for the active task IDs.');
      }
      this.lastPollError = '';
      this.pollFailureCount = 0;
    } catch (error) {
      this.lastPollError = error?.message ?? 'Task status could not be refreshed.';
      this.pollFailureCount += 1;
      this.setHistoryStatus(`Could not refresh task status: ${this.lastPollError}`, 'error');
    } finally {
      this.polling = false;
      this.schedulePolling();
    }
  }

  schedulePolling() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    if (!this.started || !this.history.some((record) => ['queued', 'running'].includes(record.status))) return;
    const retryDelay = Math.min(POLL_INTERVAL_MS * (2 ** Math.min(this.pollFailureCount, 4)), 60000);
    this.pollTimer = setTimeout(() => void this.pollActiveTasks(), retryDelay);
  }

  async clearHistory() {
    if (!this.history.length) return;
    if (!globalThis.confirm?.('Clear task metadata from this browser or desktop profile? This does not delete audio from the API.')) return;
    this.history = [];
    for (const entry of this.audioCache.values()) URL.revokeObjectURL(entry.url);
    this.audioCache.clear();
    this.audioLoading.clear();
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    await this.persistHistory();
    this.renderTracks();
    this.setHistoryStatus('Local track history cleared. API files are not deleted.', 'success');
  }
}
