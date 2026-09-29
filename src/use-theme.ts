import { useSyncExternalStore } from 'react';
import { THEME_EVENT } from './theme';

const subscribe = (listener: () => void) => {
  window.addEventListener(THEME_EVENT, listener);
  return () => window.removeEventListener(THEME_EVENT, listener);
};
const currentTheme = () => document.documentElement.dataset.brandTheme === 'dark' ? 'dark' : 'light';

export function useTheme() {
  return useSyncExternalStore(subscribe, currentTheme, () => 'light' as const);
}
