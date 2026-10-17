# Installation and first run

AceMusic AI 0.2.0 has three separate delivery targets: a standalone static web app, a WordPress shortcode plugin, and a Windows Electron desktop app. They share the same settings UI and core; credentials are handled by target-specific adapters.

> **Windows artifact status:** the Electron source, packaging configuration, and build scripts are present, but this workspace has **not** produced a Windows installer or portable `.exe`. The Electron runtime download was blocked in this environment. Do not treat either file as available until it appears in a verified release or in `dist/electron/` after a successful build. See [Windows Electron build](WINDOWS_ELECTRON_BUILD.md) for exact next steps and current verification limits.

## Choose your target

| Target | Install/run | Preferences | API key |
| --- | --- | --- | --- |
| Standalone web | Publish `dist/index.html` and `dist/src/` to an HTTPS static host | Browser localStorage/IndexedDB | Page memory only; sent directly to the configured API for each requested operation |
| WordPress | Upload `dist/wordpress/acemusic-ai.zip`, activate, add `[acemusic_ai_music_studio]` (legacy `[acemusic_ai_app]`) | Per administrator browser profile | AES-256-GCM encrypted in WordPress; server-side models/generation/status/audio proxy |
| Windows desktop | Use a successfully released NSIS installer or portable executable; neither is currently generated here | Persistent Electron user profile | Electron `safeStorage` / Windows DPAPI; saved value never returned to the renderer |

## Build prerequisites

- This repository declares Node.js **22.12+** and npm **10+** for supported development/build commands. Standalone and WordPress runtime assets have no npm runtime dependency; the WordPress archive additionally uses the system `zip` utility.
- Electron development/packaging uses the locked development dependencies. Electron downloads its platform runtime during install from an Electron release host; allow access to the download host used by `@electron/get` as well as npm's registry.
- A Windows x64 machine is the recommended environment for final Windows packaging and interactive verification. The packaging config targets x64, not ARM64. Use a Windows release supported by the selected Electron runtime.
- Do not put API credentials in `.env`, build variables, public frontend files, or source control. The current app does not require environment secrets.

## Standalone web

```sh
npm run build
```

Publish `dist/index.html` and `dist/src/` beneath an HTTPS static host. Do not publish the repository root or `dist/wordpress/`. This target does not use WordPress CSS, an iframe, a bundled backend, or a server-side API proxy. Its browser must be allowed by the API's CORS policy. The hosted `api.acemusic.ai` CORS/health behavior has not been verified here.

## WordPress

```sh
npm run build:wordpress
```

Upload `dist/wordpress/acemusic-ai.zip` in **Plugins → Add New → Upload Plugin**, install and activate **AceMusic AI Studio**, then edit the target page and replace only its designated hero/content block with `[acemusic_ai_music_studio]`. The legacy `[acemusic_ai_app]` shortcode remains supported. Keep the site theme header/navigation and the original media-library asset unchanged. The page must be updated by a site administrator; the build does not modify the live host. The UI and proxy routes are administrator-only. See [Deployment](DEPLOYMENT.md) for WordPress/PHP requirements, salts, REST proxy behavior, exact limitations, update, rollback, and removal instructions.

## Windows desktop — build from source

A user-facing installer/portable download is not available from this workspace yet. To create one on a Windows x64 build machine:

```powershell
npm run deps:install
npm run check
npm run electron:win:installer
npm run electron:win:portable
```

The expected outputs, only after each command succeeds, are:

- `dist/electron/AceMusic AI-Setup-0.2.0-x64.exe` — per-user NSIS installer.
- `dist/electron/AceMusic AI-Portable-0.2.0-x64.exe` — portable executable.

File naming follows `package.json`; check the actual filenames after packaging rather than renaming a failed or missing build. The installer does not require administrator installation, creates Start Menu and desktop shortcuts, and is configured to retain application user data on uninstall. The portable target is an executable, not an installer. Both rely on the current Windows user profile for public preferences and encrypted API credentials; Windows DPAPI data cannot be decrypted as a different OS user. Keep the user's data private and back it up only as encrypted app data.

After a verified artifact is released, download it from the release source, verify its published checksum/signature, and scan it according to your organization’s policy. Run the NSIS installer and follow its per-user prompts, or run the portable `.exe`. This project has no code-signing certificate configured; Windows SmartScreen may show an unrecognized-publisher warning until a trusted signed release is provided. Do not bypass a warning for an artifact whose origin and checksum you cannot verify.

For development, `npm run electron:dev` rebuilds the renderer, starts the desktop app, and opens DevTools. `npm run electron:launch` rebuilds and launches without automatically opening DevTools. See [Windows Electron build](WINDOWS_ELECTRON_BUILD.md) before packaging or distributing builds.

## First run and API configuration

1. Open the application; the default view is Music Studio. Open **Settings** and enter the ACE-Step REST API **base URL** (the health test appends `/health`; the studio also calls the documented model, task, and audio endpoints).
2. Enter an API key only if the server requires one. WordPress can save it encrypted on the server; Electron saves through OS-backed storage. Standalone keeps a typed key in page memory only, cleared on reload. On Linux development hosts, Electron saving is disabled unless it reports an unlocked libsecret/KWallet backend.
3. Use **Test Connection** for the real read-only `GET /health` request. The studio loads model choices from `GET /v1/models`; its Generate action submits to `POST /release_task`, polls `POST /query_result`, and fetches returned audio from `GET /v1/audio`. Mock-based tests do not prove that a remote API is reachable.
4. Use the advanced options and optional supported reference audio as needed. Use **My Tracks** for real task states and on-demand playback/download; local history stores metadata only.
5. Open **Settings** to edit the API configuration and the branding/theme editor. These preferences are non-secret; target-specific API key storage is described above.

See [Configuration and branding](CONFIGURATION_AND_BRANDING.md) for storage, key handling, URL security, and theme behavior.
