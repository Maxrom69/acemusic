# AceMusic AI — shared Music Studio

AceMusic AI is one framework-light Music Studio shared by standalone web, WordPress, and Electron deployments. The default view creates real ACE-Step generation tasks, fetches API-reported models and task status, and loads actual audio for playback/download. API configuration and the branding/theme editor remain available in Settings.

The studio uses the documented workflow: `GET /v1/models`, `POST /release_task`, `POST /query_result`, and `GET /v1/audio?path=...`. It does not fabricate model choices, generation success, audio, or tracks. Instrumental requests use empty lyrics; optional reference audio is sent using the documented multipart `reference_audio` field. Task metadata is stored in the current browser or Electron profile; audio bytes are fetched from the API on demand and are not persisted in local history.

## Requirements

- Node.js **22.12+** and npm **10+** for the supported repository build/test commands and Electron tooling.
- The WordPress plugin ZIP build uses the system `zip` command.
- WordPress installs require WordPress 6.2+, PHP 7.4+, PHP OpenSSL AES-256-GCM, `random_bytes()`, stable private `AUTH_KEY`/`AUTH_SALT` values, and outbound HTTPS access to the configured API.
- Electron runtime and builder dependencies are development-only. Electron downloads its platform runtime separately during install; access to the Electron release download host is required in addition to npm.

The generated standalone and WordPress runtimes have no npm package runtime dependency. No API credential is required to build the studio.

## Develop, test, and build

```sh
npm run deps:install           # npm ci + verify the Electron runtime binary
npm run dev                    # standalone source server, default port 4173
npm test                       # Node's built-in unit tests
npm run check                  # JS syntax checks (including Electron) plus tests
npm run build                  # independent static app in dist/
npm run preview                # build, then serve static output on port 4174
npm run build:wordpress        # plugin directory and installable ZIP in dist/wordpress/
npm run build:all              # standalone and WordPress outputs
npm run electron:build:web     # build the Electron-only shared renderer
npm run electron:dev           # launch desktop development app with DevTools
npm run electron:launch        # launch without automatically opening DevTools
npm run electron:build         # build unpacked app for the current host
npm run electron:win:installer # Windows x64 per-user NSIS installer
npm run electron:win:portable  # Windows x64 portable executable
npm run clean                  # remove standalone/Electron outputs; preserve dist/wordpress/
```

The manifest pins Electron **44.9.0**, electron-builder **26.15.3**, app version **0.2.0**, and the Windows app name **AceMusic AI**. `npm run deps:install` requires the network access needed to obtain Electron's binary. The current sandbox could not download that binary, so Electron launch and Windows packaging have not succeeded here.

## Deployment targets

### Standalone web

Run `npm run build`, then publish `dist/index.html` and `dist/src/` to an HTTPS static host. Standalone does not depend on WordPress, use an iframe, or include a backend. Public API URL/theme/logo preferences use the current browser profile; a typed API key is memory-only and is cleared on reload. The app calls the configured API directly and requires its CORS policy to allow the app origin. Do not publish `dist/wordpress/` as part of the static site.

### WordPress

Run `npm run build:wordpress`, upload `dist/wordpress/acemusic-ai.zip` under **Plugins → Add New → Upload Plugin**, and activate **AceMusic AI Studio**. Edit the target page and replace only the designated hero/content block with `[acemusic_ai_music_studio]`. The legacy `[acemusic_ai_app]` alias remains supported. The plugin does not alter a live page automatically; a site administrator must insert the shortcode. The app and its REST endpoints are limited to users with `manage_options` and a valid WordPress nonce. WordPress proxies models, generation, task queries, and audio through fixed same-origin REST routes; saved API keys are AES-256-GCM encrypted server-side and never returned to browser JavaScript. Styles are scoped and assets load only on pages containing the shortcode. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) and [`wordpress-plugin/acemusic-ai/readme.txt`](wordpress-plugin/acemusic-ai/readme.txt).

### Windows Electron desktop

The Electron target reuses the complete shared studio and runs API operations in Electron's main process through validated narrow IPC. Renderer Node integration is disabled; context isolation, sandboxing, web security, CSP, restricted navigation, and OS-backed credentials are enabled. Saved keys use Electron `safeStorage` (Windows DPAPI) and are not exposed to the renderer; public settings/branding and task metadata persist in the local Electron profile. No arbitrary IPC filesystem or shell operation is exposed.

**Current artifact status:** this workspace has not generated a Windows installer or portable executable. The build configuration and commands are implemented, but the Electron runtime download failed in this environment. Follow [`docs/WINDOWS_ELECTRON_BUILD.md`](docs/WINDOWS_ELECTRON_BUILD.md) to build/test on Windows; see [`docs/INSTALLATION.md`](docs/INSTALLATION.md) for installation and first-run steps once a verified release exists.

## API, branding, and verification

The API base URL is editable in Settings. The app tests the documented read-only `GET /health`, reads models from `GET /v1/models`, submits generation to `POST /release_task`, polls `POST /query_result`, and downloads real audio from `GET /v1/audio`. Generation/model choices are used only when returned or accepted by the configured API. Hosted API reachability, authentication, CORS, and response compatibility have not been verified here; mock-based unit tests are not evidence of a live connection.

The requested visual direction is implemented inside the application root with a near-black/deep-navy base, cyan/electric-blue and magenta accents, purple primary action, readable controls, and responsive panels. Existing branding/theme and logo controls remain reachable in Settings. The live WordPress theme/header was not available for source inspection from this environment; the plugin styles are scoped and do not recreate or edit global theme navigation. See [`docs/CONFIGURATION_AND_BRANDING.md`](docs/CONFIGURATION_AND_BRANDING.md).

See [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md) for exact tests, generated artifacts, audit results, and what remains blocked or requires WordPress admin access.
