<?php
/**
 * Remove the encrypted site API credential when the plugin is deleted from
 * the WordPress Plugins screen. Deactivating the plugin leaves it untouched.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('acemusic_ai_settings_encrypted_api_key');
