import { initializeTheme } from './theme';
// Run in the document head, before a reload can restore the settings page's
// scroll offset into the new session (which always starts on settlement).
if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
initializeTheme();
