# Deployment, installation, updates, and removal

This guide covers the static standalone web app and WordPress shortcode plugin. AceMusic AI 0.2.0 also includes a separate Windows Electron target; all three reuse the same complete Music Studio, API client, settings/branding UI, and task/history behavior, while deployment adapters and credential storage remain separate. See [`INSTALLATION.md`](INSTALLATION.md) and [`WINDOWS_ELECTRON_BUILD.md`](WINDOWS_ELECTRON_BUILD.md) for desktop instructions.

## Common build and test commands

The repository declares Node.js 22.12+ and npm 10+ for supported development/build commands. The generated standalone and WordPress runtimes have no npm package runtime dependency; the JavaScript app uses no frontend framework or external runtime package.

```sh
npm test                # unit tests
npm run check           # JavaScript syntax checks plus unit tests
npm run build           # standalone app in dist/
npm run preview         # rebuild and preview standalone files from dist/ on 0.0.0.0:4174
npm run build:wordpress # dist/wordpress/acemusic-ai.zip and expanded package
npm run build:all       # both deployment packages
```

The WordPress ZIP command requires the host operating system's `zip` utility. Override the preview port with `PORT=4174 npm run preview` (or another unused port). `npm run dev` serves the standalone source on port 4173. These simple Node servers are developer previews, not hardened production application servers.

No runtime `.env` values are required for either current deployment. `.env.example` contains clearly marked placeholders for a possible future standalone backend; no current build or frontend code reads them. Never copy a secret into public build variables, static files, a browser bundle, or browser storage.

## Standalone static web app

### Build and host

1. Run `npm run build`.
2. Upload `dist/index.html` and the `dist/src/` directory to an HTTPS static host. If `npm run build:all` has also created `dist/wordpress/`, do not publish that plugin package as part of the standalone site. The standalone output has no WordPress dependency, iframe, Node backend, database, or server-rendering requirement.
3. Configure the host to serve `index.html` for the app's entry path and serve the copied files with their normal `.js`/`.css` MIME types. For a subdirectory deployment, retain the `src/` directory under that subdirectory and serve the page at a slash-terminated path (for example, `/settings/`).
4. Use HTTPS outside local development. Publish only the standalone `index.html` and `src/` assets; do not expose the repository root, `.env`, docs, tests, the `wordpress/` package, or server-side secrets.
5. After deployment, open the hosted app, open Settings, and configure the API base URL and (if required) API key. The default view is Music Studio.

The preview command binds to `0.0.0.0` for this environment. It is not intended to replace a production static host, CDN, or TLS terminator. No special API routes, rewrites, public environment variables, or server-side variables are needed just to serve the UI.

### Standalone preferences and API keys

The API base URL and theme are saved in the current browser's localStorage; custom logo blobs use IndexedDB with a small-file fallback. These preferences are per browser profile and are not sent to an application server. They can be lost when browser site data is cleared.

The API key is not saved in localStorage, IndexedDB, a cookie, a build variable, or the static output. It stays in page memory and is cleared when the page reloads. The API health check, model lookup, generation, task query, and audio download requests go directly from the browser to the configured API; a typed key is sent in the HTTPS `Authorization: Bearer` header. A standalone deployment must therefore use an API that allows the app's origin through CORS. The cloud API's current CORS behavior is not verified here.

A static site cannot safely keep a shared private server credential. If a deployment needs a shared key, per-user durable credentials, authenticated server-side storage, or a proxy because browser CORS is unavailable, it needs an independently provisioned authenticated backend. This repository does not ship a standalone backend/proxy or user-account system; do not solve that by exposing a secret in the bundle or adding it to `.env.example` as a public build-time variable. The WordPress package below has its own same-origin server-side proxy.

### Static host updates and removal

To update, rebuild and atomically replace the previously deployed `dist/` contents with the new output. Retain the site's HTTPS and the `index.html`/`src/` relative layout. Back up any host-specific redirects before changing hosting rules. To remove, delete the deployed files and the related static-host site/routing configuration. Each user's local browser preferences remain until that browser's site data is cleared.

## WordPress plugin

### Server requirements

- WordPress 6.2 or later and PHP 7.4 or later.
- PHP OpenSSL with AES-256-GCM and `random_bytes()` available. Without these, the UI can load, but the plugin refuses to save API credentials.
- Stable, private, randomly generated `AUTH_KEY` and `AUTH_SALT` constants in `wp-config.php`; the plugin refuses placeholder/missing values. Do not use public/default salts. Changing either auth secret makes the existing encrypted API key undecryptable; delete/re-enter the key after rotating them.
- The WordPress server must be allowed to make outbound HTTPS requests to the API host and validate its TLS certificate. If `WP_HTTP_BLOCK_EXTERNAL` or a host firewall is enabled, allow the required API hostname. The browser's CORS policy for the upstream API is not needed for the WordPress proxy path.
- The WordPress admin page must be served over HTTPS on public installations. The adapter refuses to send a typed API key from an insecure non-local WordPress origin.
- Configure WordPress's canonical `home`/`siteurl` and reverse-proxy HTTPS detection so `rest_url()` produces same-origin, same-protocol REST URLs. The frontend intentionally rejects cross-origin REST endpoints rather than forwarding a nonce or key.

The plugin has no external CDN, npm runtime, Node runtime, or required PHP package. No current `.env` variables are used.

### Build and install

1. From the repository root, run `npm run build:wordpress`.
2. Confirm `dist/wordpress/acemusic-ai.zip` exists. The expanded installable directory is `dist/wordpress/acemusic-ai/`.
3. In WordPress, open **Plugins → Add New → Upload Plugin**, upload `acemusic-ai.zip`, install, and activate **AceMusic AI Studio**. Alternatively, extract the `acemusic-ai/` directory into `wp-content/plugins/` and activate it from the Plugins screen.
4. Edit the intended page as a site administrator. Replace only the designated oversized hero/content block with the preferred shortcode:

   ```text
   [acemusic_ai_music_studio]
   ```

   Keep the theme header, existing site navigation, other page content, and original media-library asset unchanged. The older `[acemusic_ai_app]` alias remains available.
5. Update/publish the page and open it while signed in as a site administrator. Visitors and other roles see an administrator-only notice rather than the studio.
6. In the app's **Settings**, configure the API base URL and optional key, save the configuration, then test the connection. The studio fetches models from `/v1/models`; generation uses `/release_task`, status uses `/query_result`, and playback/download uses `/v1/audio` through the protected WordPress proxy.

The shortcode is intended to appear once per page. The plugin enqueues its three scoped CSS files and one native ES module only when an administrator-rendered shortcode is present. It does not edit WordPress core, the active theme, site navigation, or unrelated pages, and it does not put the app in an iframe. The UI and selectors stay beneath `.acemusic-app`. The site-admin page edit is a manual step; building the plugin ZIP does not change a remote site.

### WordPress storage and request flow

| Data | Location | Secret? |
| --- | --- | --- |
| API base URL, theme, custom logo | That administrator's browser (`localStorage`/IndexedDB) | No; browser/profile-specific |
| Saved API key | Non-autoloaded WordPress option, AES-256-GCM encrypted using a key derived from `wp_salt('auth')` | Yes; raw value is never returned to browser JS |
| Typed API key | Same-origin POST body for health/models/generation/status; same-origin `Authorization: Bearer` header for audio; never a URL parameter and transient per request | Yes; not saved unless the user chooses Save |
| WordPress nonce | Shortcode page's root data attribute and same-origin REST request header | Sensitive session token; never sent cross-origin |

The REST routes are registered by the plugin, require the `manage_options` capability, and use WordPress REST nonce authentication. Credential status returns only a boolean. Saving returns no key. The fixed server-side endpoints proxy health, `/v1/models`, `/release_task`, `/query_result`, and `/v1/audio`; the plugin validates and reduces responses, enforces upload/download limits, disables redirects, and marks private responses `no-store`. Upstream error text and echoed credentials are not forwarded. The plugin does not write request bodies, key values, audio, or upstream bodies to application logs or options. Do not enable custom request-body logging for these endpoints.

WordPress site-level API credentials are shared by administrators, but the API URL and branding preferences are **per browser profile**, because they use the shared browser settings adapter. Changing the API URL in one admin's browser does not update another admin's local URL. A site that needs centrally managed URL/theme/logo settings would need a separately specified WordPress settings API; this build does not claim site-wide synchronization for those non-secret preferences.

### WordPress API/backend requirements

The plugin uses the WordPress HTTP API to call fixed documented ACE-Step routes with TLS verification enabled, no redirect following, bounded JSON/audio responses, and private no-store headers. It sends `Accept` plus `Authorization: Bearer <key>` when a typed or saved credential is available. The same shared JavaScript client validates the health, model, generation, task, and audio responses. WordPress browser requests remain same-origin; they never contact the upstream API directly.

For remote URLs the plugin requires HTTPS and validates the target through WordPress's HTTP URL validation. Plain HTTP is permitted only for loopback/local development. The WordPress host must be able to resolve and reach the API host. A failed outbound request is reported as a proxy/network failure; it is not replaced with a simulated success. The actual hosted `api.acemusic.ai` response and host-specific outbound access were not tested in this environment.

### Updates, rollback, and removal

- Before upgrading, back up the WordPress database and plugin files.
- Build and upload the complete newer ZIP through the Plugins screen, or replace the `wp-content/plugins/acemusic-ai/` directory with the complete package. Do not overwrite it with only the PHP entry file; the JavaScript/CSS assets are included beneath `assets/web/src/`.
- The encrypted credential option remains through deactivation and normal updates. A rollback to a plugin release that does not know the `acemusic_ai_settings_encrypted_api_key` option will leave that ciphertext in the database until uninstall; do not assume an older release can read it.
- To disable temporarily, deactivate the plugin. Its shortcode will stop rendering, but the encrypted option is retained.
- To remove permanently, remove `[acemusic_ai_music_studio]` or `[acemusic_ai_app]` from page content and delete the plugin through the WordPress Plugins screen. WordPress then runs `uninstall.php`, which deletes the plugin's encrypted key option. If files are removed manually, delete the plugin only after verifying a protected database backup; manual file deletion does not execute uninstall cleanup.
- Preserve `wp-config.php` salts when restoring a backup. If the salt changes, use the plugin UI to replace the key after restoring; never recover by exposing database ciphertext or logs.

## API contract and environment verification limits

The shared client follows the ACE-Step 1.5 documented workflow: `GET /health`, `GET /v1/models`, `POST /release_task`, `POST /query_result`, and `GET /v1/audio?path=...`. Generation returns a task ID; the UI polls real status codes and enables playback/download only for returned audio paths. Optional reference files use the documented multipart `reference_audio` field. Source: [ACE-Step API documentation](https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md).

This workspace has no PHP interpreter, WordPress core, or WP-CLI. JavaScript behavior, adapter mocks, and generated ZIP integrity can be tested here, but actual PHP linting/runtime, plugin activation, WordPress REST nonce/capability behavior, shortcode execution under the target active theme, reference upload on the host, and server-side WordPress outbound requests cannot be tested in this environment. The target page fetch did not expose the full host layout/source; there is no WordPress admin access in this session. No live page or API was changed or tested. These are verification limitations, not passed checks; follow a staging WordPress deployment checklist and perform the documented hero-block replacement with a site administrator before production.
