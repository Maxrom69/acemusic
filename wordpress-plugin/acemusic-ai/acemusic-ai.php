<?php
/**
 * Plugin Name: AceMusic AI Studio
 * Description: Adds the shared AceMusic music studio and settings through a scoped WordPress shortcode.
 * Version: 1.1.0
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * Author: AceMusic
 * Text Domain: acemusic-ai
 */

if (!defined('ABSPATH')) {
    exit;
}

final class AceMusic_AI_Settings_Plugin
{
    const VERSION = '1.1.0';
    const REST_NAMESPACE = 'acemusic/v1';
    const CREDENTIAL_OPTION = 'acemusic_ai_settings_encrypted_api_key';

    public function __construct()
    {
        add_shortcode('acemusic_ai_app', array($this, 'render_shortcode'));
        add_shortcode('acemusic_ai_music_studio', array($this, 'render_shortcode'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_shortcode_assets'));
        add_action('template_redirect', array($this, 'prevent_shortcode_cache'));
        add_action('rest_api_init', array($this, 'register_rest_routes'));
        add_filter('rest_pre_serve_request', array($this, 'serve_music_audio'), 10, 4);
        add_filter('script_loader_tag', array($this, 'add_module_script_type'), 10, 3);
    }

    /**
     * Render one application instance. The application is administrator-only
     * because this screen manages a site-level server-side API credential.
     *
     * @return string
     */
    public function render_shortcode()
    {
        static $instance_rendered = false;

        if (!current_user_can('manage_options')) {
            return '<p class="acemusic-admin-required">' . esc_html__('Sign in as a site administrator to use the AceMusic music studio.', 'acemusic-ai') . '</p>';
        }

        if ($instance_rendered) {
            return '<p class="acemusic-admin-required">' . esc_html__('The AceMusic studio shortcode can only be used once on a page.', 'acemusic-ai') . '</p>';
        }

        $main_script = plugin_dir_path(__FILE__) . 'assets/web/src/main.js';
        $main_style = plugin_dir_path(__FILE__) . 'assets/web/src/styles/app.css';
        $layout_style = plugin_dir_path(__FILE__) . 'assets/web/src/styles/layout.css';
        $studio_style = plugin_dir_path(__FILE__) . 'assets/web/src/styles/studio.css';
        if (!is_readable($main_script) || !is_readable($main_style) || !is_readable($layout_style) || !is_readable($studio_style)) {
            return '<p class="acemusic-admin-required">' . esc_html__('AceMusic assets are missing. Reinstall the complete plugin package.', 'acemusic-ai') . '</p>';
        }

        if (!$this->is_secure_site_request()) {
            return '<p class="acemusic-admin-required">' . esc_html__('Use HTTPS to manage AceMusic settings on this site.', 'acemusic-ai') . '</p>';
        }

        $instance_rendered = true;
        $root_attributes = array(
            'id' => 'acemusic-app',
            'class' => 'acemusic-app',
            'data-deployment' => 'wordpress',
            'data-wp-nonce' => wp_create_nonce('wp_rest'),
            'data-wp-health-url' => rest_url(self::REST_NAMESPACE . '/health-test'),
            'data-wp-credentials-url' => rest_url(self::REST_NAMESPACE . '/credentials'),
            'data-wp-credential-status-url' => rest_url(self::REST_NAMESPACE . '/credential-status'),
            'data-wp-music-models-url' => rest_url(self::REST_NAMESPACE . '/music/models'),
            'data-wp-music-generate-url' => rest_url(self::REST_NAMESPACE . '/music/generate'),
            'data-wp-music-query-url' => rest_url(self::REST_NAMESPACE . '/music/query'),
            'data-wp-music-audio-url' => rest_url(self::REST_NAMESPACE . '/music/audio'),
        );

        $attributes_html = '';
        foreach ($root_attributes as $name => $value) {
            $attributes_html .= ' ' . esc_attr($name) . '="' . esc_attr($value) . '"';
        }

        return '<div' . $attributes_html . '><p class="acemusic-loading" role="status">' . esc_html__('Loading AceMusic Music Studio…', 'acemusic-ai') . '</p><noscript><p class="acemusic-startup-error">' . esc_html__('JavaScript is required to use AceMusic Music Studio.', 'acemusic-ai') . '</p></noscript></div>';
    }

    /** Enqueue early enough for WordPress to print styles in the document head. */
    public function enqueue_shortcode_assets()
    {
        if (!is_singular()) {
            return;
        }

        $post = get_post(get_queried_object_id());
        if (!$post || !$this->has_app_shortcode($post->post_content)) {
            return;
        }
        if (!current_user_can('manage_options') || !$this->is_secure_site_request()) {
            return;
        }

        $main_script = plugin_dir_path(__FILE__) . 'assets/web/src/main.js';
        $main_style = plugin_dir_path(__FILE__) . 'assets/web/src/styles/app.css';
        $layout_style = plugin_dir_path(__FILE__) . 'assets/web/src/styles/layout.css';
        $studio_style = plugin_dir_path(__FILE__) . 'assets/web/src/styles/studio.css';
        if (!is_readable($main_script) || !is_readable($main_style) || !is_readable($layout_style) || !is_readable($studio_style)) {
            return;
        }

        $plugin_url = plugin_dir_url(__FILE__);
        wp_enqueue_style(
            'acemusic-ai-layout',
            $plugin_url . 'assets/web/src/styles/layout.css',
            array(),
            $this->asset_version('assets/web/src/styles/layout.css')
        );
        wp_enqueue_style(
            'acemusic-ai-main',
            $plugin_url . 'assets/web/src/styles/app.css',
            array('acemusic-ai-layout'),
            $this->asset_version('assets/web/src/styles/app.css')
        );
        wp_enqueue_style(
            'acemusic-ai-studio',
            $plugin_url . 'assets/web/src/styles/studio.css',
            array('acemusic-ai-main'),
            $this->asset_version('assets/web/src/styles/studio.css')
        );
        wp_enqueue_script(
            'acemusic-ai-app',
            $plugin_url . 'assets/web/src/main.js',
            array(),
            $this->asset_version('assets/web/src/main.js'),
            true
        );
    }

    /** Avoid serving another administrator's REST nonce from a cached shortcode page. */
    public function prevent_shortcode_cache()
    {
        if (!is_singular()) {
            return;
        }

        $post = get_post(get_queried_object_id());
        if ($post && $this->has_app_shortcode($post->post_content)) {
            nocache_headers();
        }
    }

    /** Check the preferred studio shortcode and the legacy alias. */
    private function has_app_shortcode($content)
    {
        return has_shortcode($content, 'acemusic_ai_music_studio') || has_shortcode($content, 'acemusic_ai_app');
    }

    /**
     * Add immutable file modification times for cache-busting.
     *
     * @param string $relative_path Path relative to this plugin directory.
     * @return string
     */
    private function asset_version($relative_path)
    {
        $path = plugin_dir_path(__FILE__) . $relative_path;
        return is_readable($path) ? (string) filemtime($path) : self::VERSION;
    }

    /**
     * Mark only this plugin's entry module as a native ES module.
     *
     * @param string $tag Existing script element.
     * @param string $handle Enqueued script handle.
     * @param string $src Script URL.
     * @return string
     */
    public function add_module_script_type($tag, $handle, $src)
    {
        if ('acemusic-ai-app' !== $handle) {
            return $tag;
        }

        return preg_replace('/<script\\b/', '<script type="module"', $tag, 1);
    }

    /** Register the administrator-only REST routes used by the adapter. */
    public function register_rest_routes()
    {
        register_rest_route(self::REST_NAMESPACE, '/credential-status', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($this, 'get_credential_status'),
            'permission_callback' => array($this, 'require_site_administrator'),
        ));
        register_rest_route(self::REST_NAMESPACE, '/credentials', array(
            array(
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => array($this, 'save_credentials'),
                'permission_callback' => array($this, 'require_site_administrator'),
                'args' => array(
                    'apiKey' => array(
                        'required' => true,
                        'type' => 'string',
                        'maxLength' => 4096,
                    ),
                ),
            ),
            array(
                'methods' => WP_REST_Server::DELETABLE,
                'callback' => array($this, 'delete_credentials'),
                'permission_callback' => array($this, 'require_site_administrator'),
            ),
        ));
        register_rest_route(self::REST_NAMESPACE, '/health-test', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($this, 'proxy_health_test'),
            'permission_callback' => array($this, 'require_site_administrator'),
            'args' => array(
                'baseUrl' => array(
                    'required' => true,
                    'type' => 'string',
                    'maxLength' => 2048,
                ),
                'apiKey' => array(
                    'required' => false,
                    'type' => 'string',
                    'maxLength' => 4096,
                ),
            ),
        ));
        register_rest_route(self::REST_NAMESPACE, '/music/models', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($this, 'proxy_music_models'),
            'permission_callback' => array($this, 'require_site_administrator'),
        ));
        register_rest_route(self::REST_NAMESPACE, '/music/generate', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($this, 'proxy_music_generate'),
            'permission_callback' => array($this, 'require_site_administrator'),
        ));
        register_rest_route(self::REST_NAMESPACE, '/music/query', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($this, 'proxy_music_query'),
            'permission_callback' => array($this, 'require_site_administrator'),
        ));
        register_rest_route(self::REST_NAMESPACE, '/music/audio', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($this, 'proxy_music_audio'),
            'permission_callback' => array($this, 'require_site_administrator'),
        ));
    }

    /** Require HTTPS outside local development, including protected REST calls. */
    private function is_secure_site_request()
    {
        if (is_ssl()) {
            return true;
        }

        $site_parts = wp_parse_url(home_url());
        $host = is_array($site_parts) && isset($site_parts['host']) ? strtolower(trim($site_parts['host'], '[]')) : '';
        return 'localhost' === $host || '127.0.0.1' === $host || '::1' === $host || substr($host, -10) === '.localhost';
    }

    /** Permission callback for all routes that may access a site credential. */
    public function require_site_administrator()
    {
        if (!current_user_can('manage_options')) {
            return new WP_Error(
                'rest_forbidden',
                __('You do not have permission to manage AceMusic settings.', 'acemusic-ai'),
                array('status' => rest_authorization_required_code())
            );
        }

        if (!$this->is_secure_site_request()) {
            return new WP_Error(
                'acemusic_insecure_wordpress',
                __('Use HTTPS for AceMusic settings on this site. Correct reverse-proxy HTTPS detection if this page is already served over TLS.', 'acemusic-ai'),
                array('status' => 403)
            );
        }

        return true;
    }

    /** Return only whether a credential is configured; never return the value. */
    public function get_credential_status()
    {
        return rest_ensure_response(array(
            'configured' => is_string(get_option(self::CREDENTIAL_OPTION, '')) && '' !== get_option(self::CREDENTIAL_OPTION, ''),
        ));
    }

    /** Encrypt and persist a new server-side API credential. */
    public function save_credentials($request)
    {
        $parameters = $request->get_json_params();
        $parameters = is_array($parameters) ? $parameters : array();
        $api_key = isset($parameters['apiKey']) && is_string($parameters['apiKey']) ? trim($parameters['apiKey']) : '';
        if ('' === $api_key || strlen($api_key) > 4096) {
            return new WP_Error(
                'acemusic_invalid_api_key',
                __('Enter an API key of 1 to 4096 characters.', 'acemusic-ai'),
                array('status' => 400)
            );
        }

        $encrypted = $this->encrypt_secret($api_key);
        if (is_wp_error($encrypted)) {
            return $encrypted;
        }

        if (false === get_option(self::CREDENTIAL_OPTION, false)) {
            add_option(self::CREDENTIAL_OPTION, $encrypted, '', 'no');
        } else {
            update_option(self::CREDENTIAL_OPTION, $encrypted, false);
        }

        return rest_ensure_response(array('configured' => true));
    }

    /** Remove the encrypted server-side API credential. */
    public function delete_credentials()
    {
        delete_option(self::CREDENTIAL_OPTION);
        return rest_ensure_response(array('configured' => false));
    }

    /**
     * Proxy exactly the documented GET /health request. Credentials are read
     * from this request for one test only or decrypted from the site option.
     * No upstream response body is logged or copied into a WordPress option.
     */
    public function proxy_health_test($request)
    {
        $parameters = $request->get_json_params();
        $parameters = is_array($parameters) ? $parameters : array();
        $base_url = isset($parameters['baseUrl']) && is_string($parameters['baseUrl']) ? trim($parameters['baseUrl']) : '';
        $api_key = isset($parameters['apiKey']) && is_string($parameters['apiKey']) ? trim($parameters['apiKey']) : '';

        if ('' === $api_key) {
            $stored = get_option(self::CREDENTIAL_OPTION, '');
            if (is_string($stored) && '' !== $stored) {
                $api_key = $this->decrypt_secret($stored);
                if (is_wp_error($api_key)) {
                    return $api_key;
                }
            }
        }

        if (strlen($api_key) > 4096) {
            return new WP_Error('acemusic_invalid_api_key', __('The API key is too long.', 'acemusic-ai'), array('status' => 400));
        }

        $validated_base_url = $this->validate_api_base_url($base_url);
        if (is_wp_error($validated_base_url)) {
            return $validated_base_url;
        }

        $headers = array('Accept' => 'application/json');
        if ('' !== $api_key) {
            $headers['Authorization'] = 'Bearer ' . $api_key;
        }

        $upstream = wp_remote_get(
            trailingslashit($validated_base_url) . 'health',
            array(
                'headers' => $headers,
                'timeout' => 10,
                'redirection' => 0,
                'limit_response_size' => 65536,
                'sslverify' => true,
            )
        );

        if (is_wp_error($upstream)) {
            return new WP_REST_Response(
                array(
                    'code' => 'acemusic_upstream_network_error',
                    'message' => __('The WordPress server could not reach the configured API. Check the API host, TLS certificate, firewall, and server outbound access.', 'acemusic-ai'),
                ),
                502
            );
        }

        $status = (int) wp_remote_retrieve_response_code($upstream);
        $content_type = wp_remote_retrieve_header($upstream, 'content-type');
        $content_type = is_string($content_type) ? $content_type : '';
        $body = wp_remote_retrieve_body($upstream);
        $decoded = json_decode($body, true);

        if ($status >= 200 && $status < 300) {
            if (!preg_match('/(?:application\\/json|\\+json)(?:\\s*;|$)/i', $content_type) || JSON_ERROR_NONE !== json_last_error() || !is_array($decoded)) {
                return new WP_REST_Response(
                    array(
                        'code' => 'acemusic_invalid_upstream_response',
                        'message' => __('The API health endpoint returned an invalid JSON response.', 'acemusic-ai'),
                    ),
                    502
                );
            }

            $safe_payload = array();
            if (isset($decoded['code']) && (is_int($decoded['code']) || is_float($decoded['code']))) {
                $safe_payload['code'] = $decoded['code'];
            }
            if (isset($decoded['data']) && is_array($decoded['data'])) {
                $safe_data = array();
                if (array_key_exists('status', $decoded['data']) && is_string($decoded['data']['status'])) {
                    $safe_data['status'] = 'ok' === $decoded['data']['status'] ? 'ok' : 'unrecognized';
                }
                foreach (array('service', 'version') as $label) {
                    if (!array_key_exists($label, $decoded['data'])) {
                        continue;
                    }
                    $safe_label = $this->safe_health_label($decoded['data'][$label], $api_key);
                    if (null !== $safe_label) {
                        $safe_data[$label] = $safe_label;
                    }
                }
                $safe_payload['data'] = $safe_data;
            }
            if (array_key_exists('error', $decoded)) {
                $safe_payload['error'] = null === $decoded['error'] ? null : array('detail' => __('The API reported an error.', 'acemusic-ai'));
            }

            $response = new WP_REST_Response($safe_payload, $status);
            $response->header('X-AceMusic-Upstream-Response', '1');
            return $response;
        }

        // Do not return arbitrary upstream error text (which could include
        // echoed credentials, server internals, or HTML) to the browser.
        $safe_detail = 401 === $status || 403 === $status
            ? __('The API rejected the supplied credentials.', 'acemusic-ai')
            : sprintf(__('The API health endpoint returned HTTP %d.', 'acemusic-ai'), $status);
        $response = new WP_REST_Response(array('detail' => $safe_detail), $status >= 400 && $status <= 599 ? $status : 502);
        $response->header('X-AceMusic-Upstream-Response', '1');
        $retry_after = wp_remote_retrieve_header($upstream, 'retry-after');
        if (is_string($retry_after) && '' !== $retry_after && false === strpos($retry_after, "\r") && false === strpos($retry_after, "\n")) {
            $response->header('Retry-After', $retry_after);
        }
        return $response;
    }

    /** Read JSON fields for API calls and form fields for reference-audio uploads. */
    private function music_request_parameters($request)
    {
        $parameters = $request->get_json_params();
        if (!is_array($parameters)) {
            $parameters = $request->get_body_params();
        }
        return is_array($parameters) ? $parameters : array();
    }

    /** Query only models reported by the configured ACE-Step API. */
    public function proxy_music_models($request)
    {
        $parameters = $this->music_request_parameters($request);
        return $this->proxy_music_json_request(
            isset($parameters['baseUrl']) && is_string($parameters['baseUrl']) ? $parameters['baseUrl'] : '',
            isset($parameters['apiKey']) && is_string($parameters['apiKey']) ? $parameters['apiKey'] : '',
            'v1/models',
            'GET',
            array()
        );
    }

    /** Submit the documented /release_task request, with optional reference_audio. */
    public function proxy_music_generate($request)
    {
        $parameters = $this->music_request_parameters($request);
        $base_url = isset($parameters['baseUrl']) && is_string($parameters['baseUrl']) ? $parameters['baseUrl'] : '';
        $api_key = isset($parameters['apiKey']) && is_string($parameters['apiKey']) ? $parameters['apiKey'] : '';
        $reference_expected = isset($parameters['acemusic_reference_audio_expected']) && '1' === (string) $parameters['acemusic_reference_audio_expected'];
        $files = $request->get_file_params();
        $reference_file = is_array($files) && isset($files['reference_audio']) && is_array($files['reference_audio'])
            ? $files['reference_audio']
            : null;

        if ($reference_expected && null === $reference_file) {
            return new WP_REST_Response(
                array('code' => 'acemusic_reference_audio_missing', 'message' => __('The reference audio upload was not received. Check the WordPress upload size limit and try again.', 'acemusic-ai')),
                400
            );
        }

        $payload = $this->normalize_generation_payload($parameters);
        if (is_wp_error($payload)) {
            return $payload;
        }
        return $this->proxy_music_json_request($base_url, $api_key, 'release_task', 'POST', $payload, $reference_file);
    }

    /** Query real task statuses from the documented /query_result endpoint. */
    public function proxy_music_query($request)
    {
        $parameters = $this->music_request_parameters($request);
        $base_url = isset($parameters['baseUrl']) && is_string($parameters['baseUrl']) ? $parameters['baseUrl'] : '';
        $api_key = isset($parameters['apiKey']) && is_string($parameters['apiKey']) ? $parameters['apiKey'] : '';
        $task_ids = isset($parameters['task_id_list']) ? $parameters['task_id_list'] : null;
        if (!is_array($task_ids) || count($task_ids) < 1 || count($task_ids) > 50) {
            return new WP_Error('acemusic_invalid_task_ids', __('Query between 1 and 50 task IDs at a time.', 'acemusic-ai'), array('status' => 400));
        }
        $safe_ids = array();
        foreach ($task_ids as $task_id) {
            if (!is_string($task_id) || '' === trim($task_id) || strlen($task_id) > 200 || preg_match('/[\\x00-\\x1F\\x7F]/', $task_id)) {
                return new WP_Error('acemusic_invalid_task_ids', __('Task IDs must be non-empty strings of at most 200 characters.', 'acemusic-ai'), array('status' => 400));
            }
            $safe_ids[] = $task_id;
        }
        if (count(array_unique($safe_ids)) !== count($safe_ids)) {
            return new WP_Error('acemusic_invalid_task_ids', __('Task IDs must be unique.', 'acemusic-ai'), array('status' => 400));
        }
        return $this->proxy_music_json_request($base_url, $api_key, 'query_result', 'POST', array('task_id_list' => $safe_ids));
    }

    /** Proxy generated bytes through this protected same-origin route. */
    public function proxy_music_audio($request)
    {
        $base_url = $request->get_param('baseUrl');
        $path = $request->get_param('path');
        if (!is_string($path) || '' === $path || strlen($path) > 4096 || preg_match('/[\\x00-\\x1F\\x7F]/', $path)) {
            return new WP_Error('acemusic_invalid_audio_path', __('The API returned an invalid audio path.', 'acemusic-ai'), array('status' => 400));
        }

        $authorization = $request->get_header('authorization');
        $provided_key = is_string($authorization) && 0 === stripos($authorization, 'Bearer ')
            ? substr($authorization, 7)
            : '';
        $api_key = $this->resolve_music_api_key($provided_key);
        if (is_wp_error($api_key)) {
            return $api_key;
        }
        $validated_base_url = $this->validate_api_base_url(is_string($base_url) ? $base_url : '');
        if (is_wp_error($validated_base_url)) {
            return $validated_base_url;
        }
        $headers = array('Accept' => 'audio/*, application/octet-stream');
        if ('' !== $api_key) {
            $headers['Authorization'] = 'Bearer ' . $api_key;
        }
        $audio_url = add_query_arg('path', $path, trailingslashit($validated_base_url) . 'v1/audio');
        $upstream = wp_remote_get($audio_url, array(
            'headers' => $headers,
            'timeout' => 60,
            'redirection' => 0,
            'limit_response_size' => 64 * 1024 * 1024,
            'sslverify' => true,
        ));
        if (is_wp_error($upstream)) {
            return $this->music_proxy_error_response(502, __('The WordPress server could not download generated audio from the configured API.', 'acemusic-ai'));
        }

        $status = (int) wp_remote_retrieve_response_code($upstream);
        if ($status < 200 || $status >= 300) {
            return $this->music_proxy_error_response($status >= 400 && $status <= 599 ? $status : 502, $this->safe_music_http_message($status));
        }
        $content_type = wp_remote_retrieve_header($upstream, 'content-type');
        $content_type = is_string($content_type) ? strtolower(trim(explode(';', $content_type)[0])) : '';
        $allowed_types = array('audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/ogg', 'audio/aac', 'audio/mp4', 'application/octet-stream');
        if (!in_array($content_type, $allowed_types, true)) {
            return $this->music_proxy_error_response(502, __('The API audio endpoint did not return a supported audio file.', 'acemusic-ai'));
        }
        $body = wp_remote_retrieve_body($upstream);
        if (!is_string($body) || '' === $body || strlen($body) > 64 * 1024 * 1024) {
            return $this->music_proxy_error_response(502, __('The generated audio is empty or exceeds the 64 MB download limit.', 'acemusic-ai'));
        }

        $response = new WP_REST_Response(array('__acemusic_audio_proxy_body' => $body), 200);
        $response->header('Content-Type', $content_type);
        $response->header('Content-Disposition', 'inline');
        $response->header('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        $response->header('Pragma', 'no-cache');
        $response->header('X-Content-Type-Options', 'nosniff');
        $response->header('X-AceMusic-Upstream-Response', '1');
        return $response;
    }

    /** Serve only the binary response produced by the protected audio route. */
    public function serve_music_audio($served, $result, $request, $server)
    {
        if (!($request instanceof WP_REST_Request) || '/'.self::REST_NAMESPACE.'/music/audio' !== $request->get_route()) {
            return $served;
        }
        if (!($result instanceof WP_REST_Response)) {
            return $served;
        }
        $data = $result->get_data();
        if (!is_array($data) || !isset($data['__acemusic_audio_proxy_body']) || !is_string($data['__acemusic_audio_proxy_body'])) {
            return $served;
        }

        $headers = $result->get_headers();
        $content_type = isset($headers['Content-Type']) && is_string($headers['Content-Type']) ? $headers['Content-Type'] : 'application/octet-stream';
        $body = $data['__acemusic_audio_proxy_body'];
        if (!headers_sent()) {
            header('Content-Type: ' . $content_type);
            header('Content-Length: ' . strlen($body));
            header('Content-Disposition: inline');
            header('Cache-Control: private, no-store, no-cache, must-revalidate');
            header('Pragma: no-cache');
            header('X-Content-Type-Options: nosniff');
            header('X-AceMusic-Upstream-Response: 1');
        }
        echo $body;
        return true;
    }

    private function normalize_generation_payload($parameters)
    {
        $allowed = array(
            'prompt', 'lyrics', 'thinking', 'vocal_language', 'audio_format', 'task_type',
            'use_random_seed', 'model', 'audio_duration', 'bpm', 'inference_steps', 'seed',
            'guidance_scale', 'time_signature', 'key_scale', 'use_format',
        );
        $payload = array();
        if (!isset($parameters['prompt']) || !is_string($parameters['prompt'])) {
            return new WP_Error('acemusic_invalid_generation_options', __('Enter a prompt before generating music.', 'acemusic-ai'), array('status' => 400));
        }
        foreach ($allowed as $key) {
            if (!array_key_exists($key, $parameters)) {
                continue;
            }
            $value = $parameters[$key];
            if (in_array($key, array('prompt', 'lyrics'), true)) {
                if (!is_string($value) || strlen($value) > ('prompt' === $key ? 4000 : 12000)) {
                    return new WP_Error('acemusic_invalid_generation_options', __('The prompt or lyrics exceeded the documented length limit.', 'acemusic-ai'), array('status' => 400));
                }
                $payload[$key] = sanitize_textarea_field($value);
            } elseif (in_array($key, array('model', 'vocal_language', 'audio_format', 'task_type', 'time_signature', 'key_scale'), true)) {
                if (!is_string($value) || strlen($value) > 128 || preg_match('/[\\x00-\\x1F\\x7F]/', $value)) {
                    return new WP_Error('acemusic_invalid_generation_options', __('A generation option contains invalid text.', 'acemusic-ai'), array('status' => 400));
                }
                $value = sanitize_text_field($value);
                if ('model' === $key && !preg_match('/^[A-Za-z0-9_.-]{1,128}$/', $value)) {
                    return new WP_Error('acemusic_invalid_generation_options', __('The selected model name is invalid.', 'acemusic-ai'), array('status' => 400));
                }
                if ('vocal_language' === $key && !preg_match('/^[a-z]{2,3}(?:-[A-Z]{2})?$/', $value)) {
                    return new WP_Error('acemusic_invalid_generation_options', __('The vocal language is invalid.', 'acemusic-ai'), array('status' => 400));
                }
                if ('audio_format' === $key && !in_array($value, array('mp3', 'wav', 'flac', 'ogg'), true)) {
                    return new WP_Error('acemusic_invalid_generation_options', __('The selected audio format is not supported.', 'acemusic-ai'), array('status' => 400));
                }
                if ('task_type' === $key && 'text2music' !== $value) {
                    return new WP_Error('acemusic_invalid_generation_options', __('Only the documented text-to-music task is available in this studio.', 'acemusic-ai'), array('status' => 400));
                }
                if ('time_signature' === $key && !in_array($value, array('2/4', '3/4', '4/4', '6/8'), true)) {
                    return new WP_Error('acemusic_invalid_generation_options', __('The selected time signature is not supported.', 'acemusic-ai'), array('status' => 400));
                }
                if ('key_scale' === $key && !preg_match('/^(?:[A-G](?:#|b)?)(?:\\s*(?:major|minor|maj|min))?$/i', $value)) {
                    return new WP_Error('acemusic_invalid_generation_options', __('Enter a valid musical key such as C major or F# minor.', 'acemusic-ai'), array('status' => 400));
                }
                if ('' !== $value) {
                    $payload[$key] = $value;
                }
            } elseif (in_array($key, array('thinking', 'use_random_seed', 'use_format'), true)) {
                $boolean = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                if (null === $boolean) {
                    return new WP_Error('acemusic_invalid_generation_options', __('A generation option must be a boolean.', 'acemusic-ai'), array('status' => 400));
                }
                $payload[$key] = $boolean;
            } elseif (in_array($key, array('audio_duration', 'bpm', 'inference_steps', 'seed', 'guidance_scale'), true)) {
                if ('' === (string) $value) {
                    continue;
                }
                if (!is_numeric($value)) {
                    return new WP_Error('acemusic_invalid_generation_options', __('A numeric generation option is invalid.', 'acemusic-ai'), array('status' => 400));
                }
                $number = 0 + $value;
                $ranges = array(
                    'audio_duration' => array(10, 600, false),
                    'bpm' => array(30, 300, true),
                    'inference_steps' => array(1, 200, true),
                    'seed' => array(0, 2147483647, true),
                    'guidance_scale' => array(0, 20, false),
                );
                list($minimum, $maximum, $integer) = $ranges[$key];
                if (!is_finite((float) $number) || $number < $minimum || $number > $maximum || ($integer && floor($number) !== $number)) {
                    return new WP_Error('acemusic_invalid_generation_options', __('A numeric generation option is outside the documented range.', 'acemusic-ai'), array('status' => 400));
                }
                $payload[$key] = $integer ? (int) $number : (float) $number;
            }
        }
        if ('' === trim($payload['prompt'])) {
            return new WP_Error('acemusic_invalid_generation_options', __('Enter a prompt before generating music.', 'acemusic-ai'), array('status' => 400));
        }
        if (!isset($payload['task_type'])) $payload['task_type'] = 'text2music';
        if (!isset($payload['audio_format'])) $payload['audio_format'] = 'mp3';
        if (!isset($payload['vocal_language'])) $payload['vocal_language'] = 'en';
        if (!isset($payload['thinking'])) $payload['thinking'] = true;
        if (!isset($payload['use_random_seed'])) $payload['use_random_seed'] = !isset($payload['seed']);
        return $payload;
    }

    /** Resolve a one-off browser key or decrypt the site-level credential in PHP. */
    private function resolve_music_api_key($provided)
    {
        if (!is_string($provided) || strlen($provided) > 4096) {
            return new WP_Error('acemusic_invalid_api_key', __('The API key is invalid or too long.', 'acemusic-ai'), array('status' => 400));
        }
        $api_key = trim($provided);
        if ('' === $api_key) {
            $stored = get_option(self::CREDENTIAL_OPTION, '');
            if (is_string($stored) && '' !== $stored) {
                $api_key = $this->decrypt_secret($stored);
                if (is_wp_error($api_key)) return $api_key;
            }
        }
        if (strlen($api_key) > 4096) {
            return new WP_Error('acemusic_invalid_api_key', __('The API key is too long.', 'acemusic-ai'), array('status' => 400));
        }
        return $api_key;
    }

    /** Send only fixed API paths and return a reduced, secret-safe response. */
    private function proxy_music_json_request($base_url, $provided_key, $endpoint, $method, $payload, $reference_file = null)
    {
        $validated_base_url = $this->validate_api_base_url(is_string($base_url) ? trim($base_url) : '');
        if (is_wp_error($validated_base_url)) return $validated_base_url;
        $api_key = $this->resolve_music_api_key($provided_key);
        if (is_wp_error($api_key)) return $api_key;
        $headers = array('Accept' => 'application/json');
        if ('' !== $api_key) $headers['Authorization'] = 'Bearer ' . $api_key;

        if (null !== $reference_file) {
            $multipart = $this->build_music_multipart_body($payload, $reference_file);
            if (is_wp_error($multipart)) return $multipart;
            $headers['Content-Type'] = $multipart['content_type'];
            $body = $multipart['body'];
        } elseif ('POST' === $method) {
            $headers['Content-Type'] = 'application/json';
            $body = wp_json_encode($payload);
        } else {
            $body = null;
        }

        $upstream = wp_remote_request(trailingslashit($validated_base_url) . ltrim($endpoint, '/'), array(
            'method' => $method,
            'headers' => $headers,
            'body' => $body,
            'timeout' => 'release_task' === $endpoint ? 45 : 20,
            'redirection' => 0,
            'limit_response_size' => 2 * 1024 * 1024,
            'sslverify' => true,
        ));
        if (is_wp_error($upstream)) {
            return $this->music_proxy_error_response(502, __('The WordPress server could not reach the configured ACE-Step API.', 'acemusic-ai'));
        }
        $status = (int) wp_remote_retrieve_response_code($upstream);
        if ($status < 200 || $status >= 300) {
            return $this->music_proxy_error_response($status >= 400 && $status <= 599 ? $status : 502, $this->safe_music_http_message($status));
        }
        $content_type = wp_remote_retrieve_header($upstream, 'content-type');
        $content_type = is_string($content_type) ? $content_type : '';
        if (!preg_match('/(?:application\\/json|\\+json)(?:\\s*;|$)/i', $content_type)) {
            return $this->music_proxy_error_response(502, __('The ACE-Step API returned an invalid JSON response.', 'acemusic-ai'));
        }
        $decoded = json_decode(wp_remote_retrieve_body($upstream), true);
        if (JSON_ERROR_NONE !== json_last_error() || !is_array($decoded)) {
            return $this->music_proxy_error_response(502, __('The ACE-Step API returned malformed JSON.', 'acemusic-ai'));
        }
        $code = isset($decoded['code']) && is_numeric($decoded['code']) ? (int) $decoded['code'] : 0;
        if (200 !== $code || (isset($decoded['error']) && null !== $decoded['error'])) {
            $error_status = in_array($code, array(401, 403, 429), true) ? $code : ($code >= 400 && $code <= 599 ? $code : 502);
            return $this->music_proxy_error_response($error_status, $this->safe_music_http_message($error_status));
        }
        if (!array_key_exists('data', $decoded) || !is_array($decoded['data'])) {
            return $this->music_proxy_error_response(502, __('The ACE-Step API response did not include the expected data.', 'acemusic-ai'));
        }

        if ('v1/models' === $endpoint) {
            $safe_data = $this->sanitize_music_models($decoded['data'], $api_key);
        } elseif ('release_task' === $endpoint) {
            $safe_data = $this->sanitize_music_generation_response($decoded['data'], $api_key);
        } else {
            $safe_data = $this->sanitize_music_task_records($decoded['data'], $api_key);
        }
        if (is_wp_error($safe_data)) {
            return $this->music_proxy_error_response(502, __('The ACE-Step API response did not match its documented format.', 'acemusic-ai'));
        }
        return $this->music_json_proxy_response(array('code' => 200, 'data' => $safe_data, 'error' => null), 200);
    }

    /** Build a bounded multipart body for the documented reference_audio field. */
    private function build_music_multipart_body($payload, $file)
    {
        if (!is_array($file) || !isset($file['tmp_name'], $file['name'], $file['size'], $file['error']) || !is_string($file['tmp_name']) || !is_string($file['name']) || UPLOAD_ERR_OK !== (int) $file['error']) {
            return new WP_Error('acemusic_invalid_reference_audio', __('The reference audio upload could not be read.', 'acemusic-ai'), array('status' => 400));
        }
        $size = (int) $file['size'];
        if ($size < 1 || $size > 25 * 1024 * 1024 || !is_uploaded_file($file['tmp_name'])) {
            return new WP_Error('acemusic_invalid_reference_audio', __('Reference audio must be a valid upload no larger than 25 MB.', 'acemusic-ai'), array('status' => 400));
        }
        $filename = sanitize_file_name(basename($file['name']));
        $filetype = wp_check_filetype($filename);
        $mime = isset($filetype['type']) && is_string($filetype['type']) ? strtolower($filetype['type']) : '';
        $allowed_mimes = array('audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/ogg', 'audio/aac', 'audio/x-aac', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'video/mp4', 'application/octet-stream');
        if ('' === $filename || !in_array($mime, $allowed_mimes, true)) {
            return new WP_Error('acemusic_invalid_reference_audio', __('Choose a supported audio file such as MP3, WAV, FLAC, OGG, M4A, AAC, or WebM.', 'acemusic-ai'), array('status' => 400));
        }
        $contents = file_get_contents($file['tmp_name']);
        if (!is_string($contents) || strlen($contents) !== $size) {
            return new WP_Error('acemusic_invalid_reference_audio', __('The reference audio file could not be read completely.', 'acemusic-ai'), array('status' => 400));
        }

        try {
            $boundary = '----AceMusic' . bin2hex(random_bytes(18));
        } catch (Throwable $exception) {
            return new WP_Error('acemusic_upload_unavailable', __('Secure request-boundary generation is unavailable on this server.', 'acemusic-ai'), array('status' => 503));
        }
        $body = '';
        foreach ($payload as $key => $value) {
            if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', (string) $key) || is_array($value) || is_object($value)) continue;
            $body .= '--' . $boundary . "\r\n";
            $body .= 'Content-Disposition: form-data; name="' . $key . '"' . "\r\n\r\n";
            $body .= is_bool($value) ? ($value ? 'true' : 'false') : (string) $value;
            $body .= "\r\n";
        }
        $body .= '--' . $boundary . "\r\n";
        $body .= 'Content-Disposition: form-data; name="reference_audio"; filename="' . str_replace(array('"', "\\\\"), '_', $filename) . '"' . "\r\n";
        $body .= 'Content-Type: ' . $mime . "\r\n\r\n";
        $body .= $contents . "\r\n";
        $body .= '--' . $boundary . "--\r\n";
        return array('body' => $body, 'content_type' => 'multipart/form-data; boundary=' . $boundary);
    }

    private function music_json_proxy_response($data, $status)
    {
        $response = new WP_REST_Response($data, $status);
        $response->header('X-AceMusic-Upstream-Response', '1');
        $response->header('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        $response->header('Pragma', 'no-cache');
        return $response;
    }

    private function music_proxy_error_response($status, $message)
    {
        $response = $this->music_json_proxy_response(array('code' => 'acemusic_upstream_error', 'message' => $message), $status);
        return $response;
    }

    private function safe_music_http_message($status)
    {
        if (401 === (int) $status || 403 === (int) $status) return __('The configured API rejected the credential or request.', 'acemusic-ai');
        if (429 === (int) $status) return __('The configured API rate-limited this request. Try again shortly.', 'acemusic-ai');
        return sprintf(__('The configured API returned HTTP %d.', 'acemusic-ai'), (int) $status);
    }

    private function sanitize_music_models($data, $api_key)
    {
        if (!isset($data['models']) || !is_array($data['models'])) return new WP_Error('invalid_models');
        $models = array();
        foreach ($data['models'] as $item) {
            $name = is_string($item) ? $item : (is_array($item) && isset($item['name']) && is_string($item['name']) ? $item['name'] : '');
            if ('' === $name || strlen($name) > 128 || !preg_match('/^[A-Za-z0-9_.-]+$/', $name) || ('' !== $api_key && false !== strpos($name, $api_key))) continue;
            $is_default = is_array($item) && isset($item['is_default']) && true === $item['is_default'];
            $models[] = array('name' => $name, 'is_default' => $is_default);
        }
        $default = isset($data['default_model']) && is_string($data['default_model']) && preg_match('/^[A-Za-z0-9_.-]{1,128}$/', $data['default_model']) ? $data['default_model'] : '';
        if ('' !== $api_key && false !== strpos($default, $api_key)) $default = '';
        return array('models' => $models, 'default_model' => $default);
    }

    private function sanitize_music_generation_response($data, $api_key)
    {
        if (!isset($data['task_id']) || !is_string($data['task_id']) || '' === $data['task_id'] || strlen($data['task_id']) > 200 || preg_match('/[\\x00-\\x1F\\x7F]/', $data['task_id'])) return new WP_Error('invalid_task_id');
        if ('' !== $api_key && false !== strpos($data['task_id'], $api_key)) return new WP_Error('invalid_task_id');
        $safe = array('task_id' => $data['task_id']);
        if (isset($data['status']) && (is_string($data['status']) || is_numeric($data['status']))) $safe['status'] = substr((string) $data['status'], 0, 32);
        if (isset($data['queue_position']) && is_numeric($data['queue_position']) && (int) $data['queue_position'] >= 0) $safe['queue_position'] = (int) $data['queue_position'];
        return $safe;
    }

    private function sanitize_music_task_records($data, $api_key)
    {
        $records = array();
        foreach ($data as $record) {
            if (!is_array($record) || !isset($record['task_id'], $record['status']) || !is_string($record['task_id']) || !is_numeric($record['status'])) continue;
            $task_id = $record['task_id'];
            $status = (int) $record['status'];
            if ('' === $task_id || strlen($task_id) > 200 || !in_array($status, array(0, 1, 2), true) || preg_match('/[\\x00-\\x1F\\x7F]/', $task_id)) continue;
            if ('' !== $api_key && false !== strpos($task_id, $api_key)) continue;
            $safe = array('task_id' => $task_id, 'status' => $status);
            if (1 === $status && isset($record['result'])) {
                $result = $record['result'];
                if (is_string($result)) {
                    $result = json_decode($result, true);
                }
                $outputs = array();
                if (is_array($result)) {
                    foreach ($result as $output) {
                        if (!is_array($output)) continue;
                        $path = isset($output['file']) && is_string($output['file']) ? $output['file'] : (isset($output['path']) && is_string($output['path']) ? $output['path'] : '');
                        if ('' === $path || strlen($path) > 4096 || preg_match('/[\\x00-\\x1F\\x7F]/', $path)) continue;
                        $decoded_path = rawurldecode($path);
                        if ('' !== $api_key && (false !== strpos($path, $api_key) || false !== strpos($decoded_path, $api_key))) continue;
                        $item = array('file' => $path);
                        $metadata = isset($output['metas']) && is_array($output['metas']) ? $output['metas'] : $output;
                        $safe_metadata = array();
                        foreach (array('title', 'model', 'dit_model', 'lm_model') as $key) {
                            if (isset($metadata[$key]) && is_string($metadata[$key]) && strlen($metadata[$key]) <= 160 && ('' === $api_key || false === strpos($metadata[$key], $api_key))) $safe_metadata[$key] = sanitize_text_field($metadata[$key]);
                        }
                        foreach (array('duration', 'audio_duration', 'bpm', 'seed') as $key) {
                            if (isset($metadata[$key]) && is_numeric($metadata[$key]) && (float) $metadata[$key] >= 0 && (float) $metadata[$key] <= 100000) $safe_metadata[$key] = 0 + $metadata[$key];
                        }
                        if ($safe_metadata) $item['metas'] = $safe_metadata;
                        $outputs[] = $item;
                    }
                }
                $safe['result'] = wp_json_encode($outputs);
            }
            $records[] = $safe;
        }
        return $records;
    }

    /** Avoid forwarding arbitrary upstream text (including an echoed key). */
    private function safe_health_label($value, $api_key)
    {
        if (!is_string($value) || strlen($value) > 128 || preg_match('/[\\x00-\\x1F\\x7F]/', $value)) {
            return null;
        }

        $label = sanitize_text_field($value);
        if ('' === $label || ('' !== $api_key && false !== strpos($label, $api_key))) {
            return null;
        }

        return $label;
    }

    /** Validate the administrator-provided target before server-side fetching. */
    private function validate_api_base_url($value)
    {
        if ('' === $value || strlen($value) > 2048 || preg_match('/[\x00-\x20\\\\]/', $value)) {
            return new WP_Error('acemusic_invalid_api_url', __('Enter a valid API base URL without spaces, credentials, query parameters, or fragments.', 'acemusic-ai'), array('status' => 400));
        }

        $parts = wp_parse_url($value);
        if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
            return new WP_Error('acemusic_invalid_api_url', __('Enter a valid API base URL without credentials, query parameters, or fragments.', 'acemusic-ai'), array('status' => 400));
        }

        $scheme = strtolower($parts['scheme']);
        $host = strtolower(trim($parts['host'], '[]'));
        $is_local = 'localhost' === $host || '127.0.0.1' === $host || '::1' === $host || substr($host, -10) === '.localhost';
        if (!in_array($scheme, array('https', 'http'), true) || ('https' !== $scheme && !$is_local)) {
            return new WP_Error('acemusic_insecure_endpoint', __('Use HTTPS for remote API servers. Plain HTTP is allowed only for localhost development.', 'acemusic-ai'), array('status' => 400));
        }

        if (!$is_local && !wp_http_validate_url($value)) {
            return new WP_Error('acemusic_invalid_api_url', __('The API URL is not a valid HTTP(S) address.', 'acemusic-ai'), array('status' => 400));
        }

        return untrailingslashit($value);
    }

    /** Require real wp-config.php secrets rather than database fallbacks or placeholders. */
    private function has_secure_auth_salts()
    {
        if (!defined('AUTH_KEY') || !defined('AUTH_SALT')) {
            return false;
        }

        $auth_key = AUTH_KEY;
        $auth_salt = AUTH_SALT;
        foreach (array($auth_key, $auth_salt) as $secret) {
            if (!is_string($secret) || strlen($secret) < 32 || false !== stripos($secret, 'put your unique phrase here')) {
                return false;
            }
        }

        return true;
    }

    /** Encrypt a secret using a key derived from WordPress salts. */
    private function encrypt_secret($plaintext)
    {
        if (!function_exists('openssl_encrypt') || !function_exists('random_bytes')) {
            return new WP_Error(
                'acemusic_encryption_unavailable',
                __('This PHP installation must provide OpenSSL AES-256-GCM and secure random bytes before API credentials can be saved.', 'acemusic-ai'),
                array('status' => 503)
            );
        }

        if (!$this->has_secure_auth_salts()) {
            return new WP_Error(
                'acemusic_encryption_unavailable',
                __('Configure unique, stable AUTH_KEY and AUTH_SALT values in wp-config.php before saving API credentials.', 'acemusic-ai'),
                array('status' => 503)
            );
        }

        try {
            $iv = random_bytes(12);
        } catch (Throwable $exception) {
            return new WP_Error('acemusic_encryption_unavailable', __('Secure random bytes are unavailable on this server.', 'acemusic-ai'), array('status' => 503));
        }

        $tag = '';
        $ciphertext = openssl_encrypt($plaintext, 'aes-256-gcm', $this->encryption_key(), OPENSSL_RAW_DATA, $iv, $tag, 'acemusic-ai-settings', 16);
        if (false === $ciphertext || 16 !== strlen($tag)) {
            return new WP_Error('acemusic_encryption_failed', __('The API credential could not be encrypted. Check the server OpenSSL configuration.', 'acemusic-ai'), array('status' => 503));
        }

        return 'v1:' . base64_encode($iv . $tag . $ciphertext);
    }

    /** Decrypt a versioned credential from the WordPress options table. */
    private function decrypt_secret($stored)
    {
        if (!$this->has_secure_auth_salts()) {
            return new WP_Error('acemusic_decryption_failed', __('Configure the original stable AUTH_KEY and AUTH_SALT values in wp-config.php before using the saved API credential.', 'acemusic-ai'), array('status' => 503));
        }

        if (!function_exists('openssl_decrypt') || 0 !== strpos($stored, 'v1:')) {
            return new WP_Error('acemusic_decryption_failed', __('The saved API credential cannot be decrypted. Re-enter it and verify the WordPress salts and OpenSSL installation.', 'acemusic-ai'), array('status' => 503));
        }

        $packed = base64_decode(substr($stored, 3), true);
        if (!is_string($packed) || strlen($packed) < 29) {
            return new WP_Error('acemusic_decryption_failed', __('The saved API credential is invalid. Re-enter it.', 'acemusic-ai'), array('status' => 503));
        }

        $iv = substr($packed, 0, 12);
        $tag = substr($packed, 12, 16);
        $ciphertext = substr($packed, 28);
        $plaintext = openssl_decrypt($ciphertext, 'aes-256-gcm', $this->encryption_key(), OPENSSL_RAW_DATA, $iv, $tag, 'acemusic-ai-settings');
        if (!is_string($plaintext)) {
            return new WP_Error('acemusic_decryption_failed', __('The saved API credential cannot be decrypted. Verify the WordPress salts or re-enter the credential.', 'acemusic-ai'), array('status' => 503));
        }

        return $plaintext;
    }

    /** Derive the AES key from the site's configured secret salt. */
    private function encryption_key()
    {
        return hash('sha256', wp_salt('auth') . '|acemusic-ai-settings-v1', true);
    }
}

new AceMusic_AI_Settings_Plugin();
