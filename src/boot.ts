import { initializeTheme, THEME_EVENT } from './theme';
import { BOOT_HOLD_END, BOOT_EXIT_DURATION, drawBrand, type BrandTheme } from './brand-motion';

const screen = document.getElementById('initial-boot');
const root = document.getElementById('root');
const canvas = document.getElementById('boot-canvas') as HTMLCanvasElement | null;
const still = document.getElementById('boot-still') as HTMLImageElement | null;
initializeTheme();
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let theme: BrandTheme = document.documentElement.dataset.brandTheme === 'dark' ? 'dark' : 'light';
let elapsed = 0;
const ctx = canvas?.getContext('2d');
function syncTheme() {
  theme = document.documentElement.dataset.brandTheme === 'dark' ? 'dark' : 'light';
  // Home-screen artwork stays fixed; only the in-app appearance follows this theme.
  if (still) still.src = `/logo-${theme}.svg`;
  if (ctx && canvas && screen?.isConnected) drawBrand(ctx, canvas.width, canvas.height, elapsed, theme);
}
syncTheme();
window.addEventListener(THEME_EVENT, syncTheme);

if (screen && root && canvas) {
  let ready = root.dataset.bootReady === 'true';
  let finished = reduced.matches;
  let leaving = false;
  let disposed = false;
  let raf = 0;
  let revealFrame = 0;
  let exitTimer = 0;
  const started = performance.now();
  function cleanup() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(revealFrame);
    clearTimeout(exitTimer);
    clearTimeout(failsafe);
    screen?.remove();
    root?.removeAttribute('inert');
    document.dispatchEvent(new Event('uchiwake:boot-complete'));
    document.removeEventListener('uchiwake:ready', onReady);
    reduced.removeEventListener('change', onMotion);
  }
  function dismiss() {
    if (!ready || !finished || leaving || disposed) return;
    leaving = true;
    // Repaint the ready page while the splash is still opaque. Cold reloads
    // can otherwise expose stale viewport tiles until the first user scroll.
    // Visibility preserves layout and fixed descendants' containing blocks.
    if (root) {
      const visibility = root.style.visibility;
      root.style.visibility = 'hidden';
      root.getBoundingClientRect();
      window.scrollTo({top: 0, left: 0, behavior: 'instant'});
      root.style.visibility = visibility;
    }
    // Give the restored page a paint opportunity before fading its cover.
    revealFrame = requestAnimationFrame(() => {
      revealFrame = requestAnimationFrame(() => {
        if (reduced.matches) cleanup();
        else {
          screen?.classList.add('boot-leaving');
          exitTimer = window.setTimeout(cleanup, BOOT_EXIT_DURATION);
        }
      });
    });
  }
  function onReady() { ready = true; dismiss(); }
  function onMotion() {
    if (!reduced.matches || disposed) return;
    cancelAnimationFrame(raf);
    finished = true;
    elapsed = BOOT_HOLD_END;
    if (ctx && canvas) drawBrand(ctx, canvas.width, canvas.height, elapsed, theme);
    if (exitTimer) cleanup(); else dismiss();
  }
  // A stalled request or a failed application bundle must not lock the page.
  const failsafe = window.setTimeout(cleanup, 8000);
  root.setAttribute('inert', '');
  document.addEventListener('uchiwake:ready', onReady);
  reduced.addEventListener('change', onMotion);
  const scale = Math.min(devicePixelRatio || 1, 3);
  canvas.width = Math.round(340 * scale);
  canvas.height = Math.round(340 * 1385 / 1750 * scale);
  screen.classList.add('boot-running');
  function tick(now: number) {
    if (disposed) return;
    elapsed = reduced.matches ? BOOT_HOLD_END : now - started;
    if (ctx && canvas) drawBrand(ctx, canvas.width, canvas.height, elapsed, theme);
    if (elapsed >= BOOT_HOLD_END) { finished = true; dismiss(); }
    else raf = requestAnimationFrame(tick);
  }
  if (!ctx) {
    screen.classList.add('boot-static');
    finished = true;
    dismiss();
  } else tick(started);
}
