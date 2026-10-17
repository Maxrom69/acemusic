# Windows Electron build and release guide

## Current build status

Electron 44.9.0 and electron-builder 26.15.3 are pinned in `package.json`/`package-lock.json`. The Windows x64 packaging config, NSIS installer target, portable target, and icon assets are implemented.

**No Windows installer or portable executable has been generated or verified in this workspace.** Installing the npm package did not install Electron's platform runtime: `@electron/get` failed its runtime download with `TypeError: fetch failed`, and requiring `electron` confirmed that the binary was missing. This Linux environment also has no display/Xvfb, Windows host, Wine, makensis, or PowerShell. The NSIS/portable commands, Electron launch, and Windows install/uninstall behavior therefore remain unverified. Do not publish an artifact until a Windows x64 build and smoke test succeed.

## Toolchain and network access

- Windows x64 is the recommended release builder; x64 is the only configured architecture.
- Node.js 22.12+ and npm 10+ are required by the project manifest.
- The lockfile pins Electron 44.9.0 and electron-builder 26.15.3. npm dependencies come from the npm registry; Electron's runtime binary is downloaded separately during installation from the Electron release distribution. A restrictive proxy/firewall can allow `registry.npmjs.org` while still blocking that binary download.
- No code-signing certificate, signing identity, updater, or automatic update service is configured. A distributable release should be signed and timestamped by the release owner, then verified in a clean Windows test account/VM.

## Build commands

Run from the repository root in PowerShell or a Windows terminal:

```powershell
npm run deps:install
npm run check
npm run electron:build:web
npm run electron:dev
```

`electron:dev` builds the Electron renderer and launches the app with DevTools open. `electron:launch` builds the same renderer and launches without automatically opening DevTools. The Electron renderer is copied to `dist/electron-web/`; it reuses the complete Music Studio, shared API client, task/history logic, settings/branding UI, and shared CSS. The Electron-only bootstrap omits the WordPress adapter and WordPress styles.

Build and inspect an unpacked app with:

```powershell
npm run electron:build
```

This runs `electron-builder --dir --x64` for the current host. `electron:dir` is retained as an alias. For the Windows release formats, run the targets separately:

```powershell
npm run electron:win:installer
npm run electron:win:portable
```

Both Windows commands rebuild the web assets before packaging. Output is directed to `dist/electron/`. The configured artifact names are:

- `AceMusic AI-Setup-0.2.0-x64.exe` — NSIS installer.
- `AceMusic AI-Portable-0.2.0-x64.exe` — portable executable.

The names describe the configuration, **not files currently present**. Confirm the actual outputs and exit code after each packaging command. Do not rename an absent or failed build into a deliverable. The Windows x64 icon is `build/icon.ico`; source and preview assets are `build/icon.svg` and `build/icon.png`.

## Packaging configuration

`package.json` identifies the application as **AceMusic AI 0.2.0**, with app ID `ai.acemusic.settings`. The `asar` archive is enabled. NSIS is per-user (`perMachine: false`), does not require elevation, allows an install-folder choice, creates Start Menu/desktop shortcuts, and is configured not to delete application data on uninstall. The portable target is configured as a separate standalone `.exe`. The package carries the main/preload files, shared core, and built Electron renderer; the WordPress plugin is not included in the Electron renderer build.

`npm run clean` removes the standalone and Electron generated web/package outputs under `dist/` but deliberately preserves `dist/wordpress/` and its existing plugin ZIP.

## Security and release checks

Electron's main window sets `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true`. The renderer uses a restrictive CSP and a context-isolated preload with fixed operations for key status/save/remove, health test, model lookup, generation, task query, and audio fetch. Main-process handlers validate the top-level app frame and strict request shapes, including bounded reference-audio bytes. No renderer filesystem or generic shell API is exposed. The only external-browser action is a main-process allowlist for the fixed ACE-Step GitHub documentation URL; other new windows/navigation are denied.

Saved desktop API keys are encrypted through Electron `safeStorage`, backed by Windows DPAPI on Windows. The ciphertext is stored under Electron's per-user application data directory; the raw value is not returned to the renderer or written to logs/public preferences. A key typed into the password field remains in renderer memory until cleared and is sent to the main process only for an explicitly requested API operation or a deliberate save. The user must use HTTPS for non-loopback API hosts. See [Configuration and branding](CONFIGURATION_AND_BRANDING.md) for Linux fallback behavior and data-retention details.

Before releasing a Windows build:

1. Run a clean `npm ci`/`npm run deps:install` from the lockfile on the release machine.
2. Run `npm run check`, inspect the generated Electron renderer, and confirm it does not include WordPress CSS or adapter files.
3. Build the unpacked app and launch it interactively. Verify the browser window has no Node integration, check navigation/IPC behavior, and confirm no API key appears in renderer storage, returned IPC values, console output, or logs.
4. Use a controlled test API or the real configured ACE-Step endpoint to verify `/health`, `/v1/models`, generation submission, task polling, and audio delivery. A mocked test response is not evidence of service reachability.
5. In a clean Windows user profile, install/run each target; save, restart, test, rotate, and remove a key; edit/restart/reset URL, theme, and logo; uninstall and verify the configured user-data retention behavior.
6. Sign the installer/portable executable, timestamp it, record SHA-256 checksums, scan it, and test the signed files on supported Windows versions before publishing.

## Audit and known limits

`npm audit --omit=dev --audit-level=moderate` reports no production dependency vulnerabilities. The full audit currently reports eight **moderate** findings in the build-only electron-builder dependency chain (`@electron/get`/`global-agent`/`roarr`/`sprintf-js` and related builder packages), with no high or critical findings at the pinned 26.15.3 version. npm proposes downgrading electron-builder to 26.5.0; that downgrade introduced high/critical vulnerable transitive packages in this lockfile, so it was not retained. Review the audit again before publishing and upgrade to a compatible fixed builder release when available; do not use `npm audit fix --force` blindly.

The current sandbox ran unit/mock tests only; it could not install the Electron binary, open a GUI, produce the NSIS installer/portable `.exe`, test Windows DPAPI, or verify a live API. Exact outcomes are recorded in [`IMPLEMENTATION_REPORT.md`](IMPLEMENTATION_REPORT.md).
