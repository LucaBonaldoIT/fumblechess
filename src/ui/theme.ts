const KEY = 'deepchess:theme';
type Theme = 'light' | 'dark';

const ICON: Record<Theme, string> = {
  // icon shows the mode you will switch to
  light:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  dark: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
};

function current(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function apply(theme: Theme, button: HTMLElement) {
  document.documentElement.dataset.theme = theme;
  button.innerHTML = ICON[theme];
}

/** Theme is set before first paint by an inline script in index.html; this wires the toggle. */
export function initTheme(button: HTMLElement) {
  apply(current(), button);
  button.addEventListener('click', () => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    apply(next, button);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // storage unavailable: theme just won't persist
    }
  });
}
