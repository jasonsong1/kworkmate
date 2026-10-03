// The back office is dark by default and can be shown light. The choice is kept on the
// device and on the person's account, so signing in again on any device restores the same look.
export const THEME_KEY = 'kw_theme_v2';

export const LIGHT_CHROME = '#ffffff';
export const DARK_CHROME = '#111316';

function paintChrome(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? DARK_CHROME : LIGHT_CHROME);
}

export function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme) {
  const dark = theme !== 'light';
  document.documentElement.classList.toggle('dark', dark);
  paintChrome(dark ? 'dark' : 'light');
}

export function saveTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // A blocked storage only means the choice does not survive a reload.
  }
  applyTheme(next);
}

// The sign-in screen and the applicant pages keep the light look, so leaving the back
// office hands them back a clean light document.
export function resetTheme() {
  document.documentElement.classList.remove('dark');
  paintChrome('light');
}