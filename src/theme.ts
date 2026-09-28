export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_KEY = 'uchiwake-theme';
export const THEME_EVENT = 'uchiwake:theme';
const valid = (value: string | null | undefined): ThemePreference =>
  value === 'light' || value === 'dark' ? value : 'system';

export function getThemePreference(): ThemePreference {
  return valid(document.documentElement.dataset.themePreference);
}

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  const dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.themePreference = preference;
  root.dataset.brandTheme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  document.getElementById('app-theme-color')?.setAttribute('content', dark ? '#000000' : '#ffffff');
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function setThemePreference(preference: ThemePreference) {
  try { localStorage.setItem(THEME_KEY, preference); } catch { /* Keep this session usable without storage. */ }
  applyTheme(preference);
}

export function initializeTheme() {
  if (document.documentElement.dataset.themePreference) return;
  let preference: ThemePreference = 'system';
  try { preference = valid(localStorage.getItem(THEME_KEY)); } catch { /* Use the system appearance. */ }
  applyTheme(preference);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePreference() === 'system') applyTheme('system');
  });
  window.addEventListener('storage', event => {
    if (event.key === THEME_KEY || event.key === null) applyTheme(valid(event.newValue));
  });
}
