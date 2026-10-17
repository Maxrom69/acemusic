export const DEFAULT_API_BASE_URL = 'https://api.acemusic.ai';
export const ACE_STEP_HEALTH_PATH = '/health';
export const DEFAULT_LOGO_URL = 'https://acemusic.ai/logo-rectangle.svg';
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Dark studio palette following the requested near-black/navy, cyan, magenta,
 * and purple direction. Values remain user-editable by the shared branding UI.
 */
export const DEFAULT_THEME = Object.freeze({
  primary: '#0C1020',
  secondary: '#18213A',
  accent: '#8B5CF6',
  pageBackground: '#080B18',
  cardBackground: '#101629',
  surfaceBackground: '#141D33',
  textPrimary: '#F3F6FF',
  textSecondary: '#A5B0C7',
  border: '#27324B',
  buttonBackground: '#6D39D6',
  buttonText: '#FFFFFF',
  link: '#51DDF5',
  focus: '#5BDDF0',
});

export const THEME_FIELDS = Object.freeze([
  { key: 'primary', label: 'Primary brand', group: 'Brand colors' },
  { key: 'secondary', label: 'Secondary brand', group: 'Brand colors' },
  { key: 'accent', label: 'Accent', group: 'Brand colors' },
  { key: 'pageBackground', label: 'Page background', group: 'Surfaces' },
  { key: 'cardBackground', label: 'Card background', group: 'Surfaces' },
  { key: 'surfaceBackground', label: 'Surface background', group: 'Surfaces' },
  { key: 'border', label: 'Borders', group: 'Surfaces' },
  { key: 'textPrimary', label: 'Primary text', group: 'Typography' },
  { key: 'textSecondary', label: 'Secondary text', group: 'Typography' },
  { key: 'buttonBackground', label: 'Button background', group: 'Controls' },
  { key: 'buttonText', label: 'Button text', group: 'Controls' },
  { key: 'link', label: 'Links', group: 'Controls' },
  { key: 'focus', label: 'Focus ring', group: 'Controls' },
]);

export const THEME_CSS_VARIABLES = Object.freeze({
  primary: '--am-primary',
  secondary: '--am-secondary',
  accent: '--am-accent',
  pageBackground: '--am-page-background',
  cardBackground: '--am-card-background',
  surfaceBackground: '--am-surface-background',
  textPrimary: '--am-text-primary',
  textSecondary: '--am-text-secondary',
  border: '--am-border',
  buttonBackground: '--am-button-background',
  buttonText: '--am-button-text',
  link: '--am-link',
  focus: '--am-focus',
});

/** Public settings never contain secrets. */
export const DEFAULT_PUBLIC_SETTINGS = Object.freeze({
  apiBaseUrl: DEFAULT_API_BASE_URL,
});

/** Branding preferences are user-owned, non-sensitive application settings. */
export const DEFAULT_BRANDING_PREFERENCES = Object.freeze({
  theme: DEFAULT_THEME,
});

/** Deployment concerns are intentionally not mixed into user settings. */
export const DEFAULT_DEPLOYMENT_SETTINGS = Object.freeze({
  target: 'standalone-web',
  apiAccess: 'direct-browser',
});
