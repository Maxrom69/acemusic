export interface PublicApplicationSettings {
  /** API service root only; never include credentials or query parameters. */
  apiBaseUrl: string;
}

export interface ThemeTokens {
  primary: string;
  secondary: string;
  accent: string;
  pageBackground: string;
  cardBackground: string;
  surfaceBackground: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  buttonBackground: string;
  buttonText: string;
  link: string;
  focus: string;
}

export interface UserBrandingPreferences {
  theme: ThemeTokens;
}

/** Platform adapters implement this contract (browser, WordPress, Electron). */
export interface SettingsStore {
  loadPublicSettings(): Promise<PublicApplicationSettings>;
  savePublicSettings(settings: PublicApplicationSettings): Promise<PublicApplicationSettings>;
  loadBranding(): Promise<UserBrandingPreferences>;
  saveBranding(branding: UserBrandingPreferences): Promise<UserBrandingPreferences>;
  loadLogo(): Promise<Blob | null>;
  saveLogo(logo: Blob | null): Promise<void>;
}

/** Implement with an OS keychain or authenticated server-side proxy when available. */
export interface CredentialStore {
  /** Raw keys are available only from a local memory/OS store, never a web proxy. */
  getApiKey(): Promise<string>;
  hasApiKey(): Promise<boolean>;
  setApiKey(value: string): Promise<void>;
  clearApiKey(): Promise<void>;
}
