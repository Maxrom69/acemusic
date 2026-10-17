# Configuration, credential storage, and branding

AceMusic AI uses one shared Music Studio and settings/branding interface. API connection settings, credentials, theme colors, logos, and task history are handled separately so a public preference is never mistaken for a secret.

## API configuration

- Enter the API **base URL**, not a path such as `/health`; the health client appends `/health`, while the Music Studio calls the documented `/v1/models`, `/release_task`, `/query_result`, and `/v1/audio` routes.
- The default base URL is `https://api.acemusic.ai`, but it is user-editable. Hosted API reachability, response behavior, and CORS have not been verified in this environment.
- Remote API keys are sent only over HTTPS. Plain HTTP with a key is rejected except for loopback/local development. URL credentials, unsupported schemes, invalid URLs, unexpected API envelopes, HTTP errors, timeouts, and rate limits are not treated as success. HTTP redirects are rejected so an Authorization header is not forwarded to a redirected endpoint.
- **Test Connection** performs the documented read-only `GET /health` request. The UI reports health success only when the real response matches the ACE-Step health envelope (`code: 200`, `data.status: "ok"`). Model selection uses only names returned by `/v1/models`; generation is submitted to `/release_task`, status comes from `/query_result`, and audio is fetched from `/v1/audio`. Unit tests inject mock responses; they do not establish production API reachability.
- Do not put credentials in `.env`, public environment variables, static files, source code, `localStorage`, IndexedDB, or logs. The present standalone app has no server-side credential vault or shared backend.

## Credential behavior by target

| Target | Saved key location | What the renderer receives | Request path |
| --- | --- | --- | --- |
| Standalone web | Not saved; in-memory credential store only | The page holds a key typed by the user until reload | Browser → configured API, requiring API CORS |
| WordPress | AES-256-GCM ciphertext in a non-autoloaded WordPress option, encrypted with a key derived from WordPress auth salt | Boolean saved-key status only; saved raw key is never returned | Browser → same-origin WordPress REST proxy → configured API |
| Electron desktop | Electron `safeStorage` ciphertext in the current user's Electron application data directory | Boolean saved-key status only; saved raw key is never returned | Renderer invokes fixed IPC API methods; the main process decrypts/uses the key and calls the API |

### Electron OS-backed storage

On Windows, Electron `safeStorage` uses Windows DPAPI for the current Windows account. On macOS it uses the system Keychain. On Linux, saving is allowed only when Electron reports an unlocked `gnome_libsecret`, `kwallet`, `kwallet5`, or `kwallet6` backend. The Linux `basic_text` fallback is deliberately refused. A user may still type a key and make a one-time API request when secure saving is unavailable, but the app will not persist that key insecurely.

The saved credential file contains a versioned Base64 encoding of ciphertext, not the raw API key. The main process uses an atomic temporary-file write under Electron's per-user data directory. Keys are validated and bounded; failure messages are sanitized. The preload bridge exposes only key status/save/remove plus the fixed health, models, generation, task-query, and audio methods; it has no read-saved-key, arbitrary filesystem, or generic shell method. The renderer can see whether a saved key exists and request its deletion, but cannot retrieve the saved value.

A key manually entered in the password field remains in that renderer's memory until the field is cleared or the app is closed. It is passed through a restricted IPC request for an explicit API operation or save. It is never saved automatically. If OS encryption is unavailable, **Save Configuration** reports the limitation; the user can still test with the typed key. Losing access to the Windows account or changing OS credentials may make DPAPI ciphertext undecryptable. The app does not silently fall back to plaintext; remove the saved key and re-enter it if decryption fails. Electron uninstallation is configured to retain application user data.

### WordPress storage reference

WordPress uses its own PHP credential store and same-origin server proxy. The saved key is encrypted with AES-256-GCM using a key derived from a stable private `AUTH_KEY`/`AUTH_SALT`. Changing the salts makes stored ciphertext unreadable. Site administrators share that WordPress credential, while API URL/theme/logo preferences remain in each administrator's browser profile. See [Deployment](DEPLOYMENT.md) for the WordPress requirements and operational steps.

## Public settings and persistence

The following values are non-secret preferences:

- API base URL.
- Theme color tokens.
- Optional custom logo.
- Bounded task/history metadata (task IDs, status, prompt summary, and returned audio paths), stored separately from credentials; audio bytes are fetched on demand and are not saved in history.

Standalone web and WordPress store public settings in browser localStorage and logo blobs in IndexedDB (with a small-file fallback). In Electron, the shared browser storage adapter uses the persistent Chromium profile associated with the desktop app, and logos remain local to that profile. These values are not synchronized between targets, browsers, WordPress administrators, Windows accounts, or devices. Clearing a browser/Electron profile can remove them.

The standalone web key is intentionally memory-only. WordPress saves credentials on the server. Electron saves them only through OS-backed secure storage. Do not copy a saved desktop credential file to another account/device and assume it can be decrypted there.

## Branding and theme controls

The existing shared branding editor is reused in Electron; it is not a separate desktop theme implementation.

- Theme color tokens update the shared preview live and persist when **Save Theme** is selected.
- **Reset Theme** restores the shared default palette.
- A custom logo must be a PNG or JPG of at most 2 MB. It preserves the aspect ratio and is stored as a local user preference; **Reset logo** restores the default AceMusic logo.
- The desktop executable has a separate Windows icon (`build/icon.ico`) with multiple raster sizes. The SVG and PNG are source/preview assets.
- The shared UI defaults follow the requested near-black/deep-navy, cyan/electric-blue, magenta/pink, and purple direction; palette values remain editable and are not represented as official AceMusic design tokens. The host page's source CSS/layout was not exposed to this environment, so exact live-theme typography, spacing, and pixel matching are not claimed.

## Environment variables and logs

No current target reads an API key from a build-time environment variable. The Electron development launcher recognizes `ACEMUSIC_OPEN_DEVTOOLS=1` only through its controlled development script; the main process can accept `ACEMUSIC_RENDERER_URL` only when it is a loopback HTTP URL in an unpackaged development run. Packaged builds always load the bundled local renderer. Neither variable carries a credential.

Application code does not log API keys or request bodies. Keep host-specific HTTP/body logging disabled or appropriately redacted if you add an external proxy later. No `.env` file or private credential is needed to build the static or WordPress UI.
