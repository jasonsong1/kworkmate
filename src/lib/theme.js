// The back office can be shown light or dark. The choice is kept on the device and on the
// person's account, so signing in again on any device restores the same look.
export const THEME_KEY = 'kw_theme';

export function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0f172a' : '#4338ca');
}

export function saveTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // A blocked storage only means the choice does not survive a reload.
  }
  applyTheme(next);
}