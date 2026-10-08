import {
  getStoredTheme,
  getTheme,
  initTheme as initDesignTheme,
  onThemeChange,
  setTheme,
  toggleTheme,
  type Theme,
} from '@lucabonaldo/design';

// key used before the theme moved to the design system's shared cookie
const LEGACY_KEY = 'deepchess:theme';

const ICON: Record<Theme, string> = {
  // icon shows the mode you will switch to
  light:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  dark: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
};

/**
 * Theme state, persistence (a cookie shared across lucabonaldo.dev) and theme-color come from
 * the design system, whose inline script sets the theme before first paint. This migrates the
 * old stored choice once and keeps the toggle's icon in sync.
 */
export function initTheme(button: HTMLElement) {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy === 'light' || legacy === 'dark') {
      if (!getStoredTheme()) setTheme(legacy);
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch {
    // storage unavailable: nothing to migrate
  }
  const paint = (theme: Theme) => {
    button.innerHTML = ICON[theme];
  };
  button.addEventListener('click', toggleTheme);
  onThemeChange(paint);
  initDesignTheme();
  paint(getTheme());
}
