import { BRAND_THEMES, BOOT_HOLD_END, BOOT_EXIT_DURATION, drawBrand, type BrandTheme } from './brand-motion';

const screen = document.getElementById('initial-boot');
const root = document.getElementById('root');
const canvas = document.getElementById('boot-canvas') as HTMLCanvasElement | null;
const still = document.getElementById('boot-still') as HTMLImageElement | null;
const dark = matchMedia('(prefers-color-scheme: dark)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let theme: BrandTheme = dark.matches ? 'dark' : 'light';
let elapsed = 0;
const ctx = canvas?.getContext('2d');
function syncTheme() {
  theme = dark.matches ? 'dark' : 'light';
  document.documentElement.dataset.brandTheme = theme;
  document.getElementById('app-icon')?.setAttribute('href', `/icon-${theme}.svg`);
  document.getElementById('app-manifest')?.setAttribute('href', `/manifest-${theme}.webmanifest`);
  document.getElementById('app-theme-color')?.setAttribute('content', BRAND_THEMES[theme].background);
  if (still) still.src = `/logo-${theme}.svg`;
  if (ctx && canvas && screen?.isConnected) drawBrand(ctx, canvas.width, canvas.height, elapsed, theme);
}
syncTheme();
dark.addEventListener('change', syncTheme);

if (screen && root && canvas) {
  let ready = root.dataset.bootReady === 'true';
  let finished = reduced.matches;
  let leaving = false;
  let disposed = false;
  let raf = 0;
  let exitTimer = 0;
  const started = performance.now();
  function cleanup() {
    disposed = true;
    cancelAnimationFrame(raf);
    clearTimeout(exitTimer);
    clearTimeout(failsafe);
    screen?.remove();
    root?.removeAttribute('inert');
    document.removeEventListener('uchiwake:ready', onReady);
    reduced.removeEventListener('change', onMotion);
  }
  function dismiss() {
    if (!ready || !finished || leaving || disposed) return;
    leaving = true;
    if (reduced.matches) cleanup();
    else {
      screen?.classList.add('boot-leaving');
      exitTimer = window.setTimeout(cleanup, BOOT_EXIT_DURATION);
    }
  }
  function onReady() { ready = true; dismiss(); }
  function onMotion() {
    if (!reduced.matches || disposed) return;
    cancelAnimationFrame(raf);
    finished = true;
    elapsed = BOOT_HOLD_END;
    if (ctx && canvas) drawBrand(ctx, canvas.width, canvas.height, elapsed, theme);
    if (leaving) cleanup(); else dismiss();
  }
  // A stalled request or a failed application bundle must not lock the page.
  const failsafe = window.setTimeout(cleanup, 8000);
  root.setAttribute('inert', '');
  document.addEventListener('uchiwake:ready', onReady);
  reduced.addEventListener('change', onMotion);
  const scale = Math.min(devicePixelRatio || 1, 3);
  canvas.width = Math.round(240 * scale);
  canvas.height = Math.round(190 * scale);
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
