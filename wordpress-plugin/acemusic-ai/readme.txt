=== AceMusic AI Studio ===
Contributors: acemusic
Tags: acemusic, music-studio, shortcode, ai
Requires at least: 6.2
Requires PHP: 7.4
Stable tag: 1.1.0

Embeds the shared AceMusic Music Studio through [acemusic_ai_music_studio]. The legacy [acemusic_ai_app] shortcode remains supported.

== Description ==

AceMusic AI Studio packages the same shared application used by the standalone web and Electron targets. The Music Studio is the default view and includes prompt/style, lyrics or instrumental mode, API-reported model choices, optional reference-audio upload, advanced generation options, real task status, My Tracks, playback, and download. API configuration and the branding/theme editor remain available from Settings.

The plugin is a narrow WordPress deployment adapter. It enqueues app assets only on a page containing either shortcode, scopes app styles under `.acemusic-app`, and uses administrator-only same-origin REST routes with WordPress REST nonces. WordPress proxies the documented ACE-Step `/v1/models`, `/release_task`, `/query_result`, and `/v1/audio` operations. The plugin uses fixed upstream paths, rejects unsafe remote HTTP, does not follow redirects, limits uploads and downloads, and filters upstream responses before returning them to the browser.

Saved API credentials are encrypted on the WordPress server with AES-256-GCM using a key derived from the WordPress authentication salt and are never returned to browser JavaScript. A typed credential is sent only over the protected same-origin REST request for that operation; it is never logged or stored by a test request. Local history contains task metadata and returned file paths only, not audio bytes or API credentials.

== Installation ==

1. Build the complete install package with `npm run build:wordpress` or use the provided `dist/wordpress/acemusic-ai.zip`.
2. Install the ZIP through Plugins > Add New > Upload Plugin, or extract the `acemusic-ai` directory into `wp-content/plugins/`.
3. Activate **AceMusic AI Studio**.
4. Edit the target page as a site administrator. Replace only the designated hero/content block with `[acemusic_ai_music_studio]`; keep the theme header, navigation, other content, and the original media-library asset unchanged.
5. Publish/update the page and open it while signed in as a site administrator. The shortcode is intentionally limited to `manage_options` users.
6. Open Settings in the studio, enter the ACE-Step API base URL and (if required) API key, then save. Use the API health test to verify `/health`; model choices are fetched live from `/v1/models`.
7. Serve the site over HTTPS before saving or using credentials on a public host.

The plugin package does not change a remote WordPress page automatically. The page editor step must be performed by a site administrator.

== Shortcodes ==

Preferred: `[acemusic_ai_music_studio]`

Legacy alias: `[acemusic_ai_app]`

Use the shortcode once per page. Visitors without site-administrator permissions see a short notice. Other WordPress pages are not modified. The plugin does not add a site header, navigation, toolbar, or iframe.

== Security and server requirements ==

* WordPress 6.2 or later and PHP 7.4 or later.
* PHP OpenSSL with AES-256-GCM support and `random_bytes()` to save an encrypted API key.
* Stable, private, randomly generated `AUTH_KEY` and `AUTH_SALT` constants in `wp-config.php`. Placeholder or missing values are rejected. Changing either makes the stored key undecryptable; delete and re-enter it after rotating salts.
* Outbound HTTPS access from the WordPress host to the configured ACE-Step API host. Firewall, DNS/TLS issues, or blocked outbound requests can prevent API operations.
* HTTPS on the WordPress site for non-local installations. Do not expose administrator pages over plain HTTP.
* Configure only a trusted API endpoint. API base URLs are validated; proxy paths are fixed, redirects are disabled, and arbitrary upstream error bodies are never forwarded.
* Reference audio is limited to 25 MB. Proxy playback/download is limited to 64 MB and is returned with private no-store headers.

The shortcode and REST endpoints are restricted to users with the `manage_options` capability. REST requests require a valid WordPress REST nonce. The credential is stored as ciphertext in a non-autoloaded WordPress option; database backups still contain that ciphertext, so protect backups and `wp-config.php` salts.

== Updates and removal ==

To update, upload the complete newer plugin ZIP through the WordPress Plugins screen or replace the plugin directory with the new package. Back up the site before updating. The encrypted credential remains in the WordPress options table across updates and deactivation.

To disable the app but retain its settings, deactivate the plugin. To remove it, delete the plugin from the WordPress Plugins screen. WordPress runs `uninstall.php` on plugin deletion and removes the encrypted credential option. Remove either shortcode from pages that should no longer contain the application.

== Troubleshooting ==

* If the page reports missing assets, reinstall the complete plugin ZIP; do not copy only the PHP file.
* If API key saving reports encryption is unavailable, ask the host to enable OpenSSL AES-256-GCM and `random_bytes()`.
* If a saved key cannot be decrypted after changing WordPress salts, enter it again.
* If the API test or model list cannot reach the server, verify the configured HTTPS base URL, API certificate, DNS, host firewall, outbound HTTP restrictions, and ACE-Step endpoints.
* If reference upload fails, check WordPress/PHP upload limits and use a supported audio file no larger than 25 MB.
* A browser-side WordPress REST error may indicate an expired login or nonce; sign in as an administrator again and reload the shortcode page.
* Do not enable request-body logging for these REST routes; a typed credential is sent to WordPress over the same-origin request.
