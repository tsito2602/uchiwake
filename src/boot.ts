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
          const handover = screen ? toDock(screen) : 0;
          if (handover) exitTimer = window.setTimeout(cleanup, handover);
          else {
            screen?.classList.add('boot-leaving');
            exitTimer = window.setTimeout(cleanup, BOOT_EXIT_DURATION);
          }
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

// Adapted from uchino: instead of fading, the mark itself drops into the
// bottom navigation. It lifts a little, falls under gravity while shrinking to
// the dock's height, lands with a small squash, and the dock opens out of it.
// Returns how long the handover runs, or 0 when there is no dock on screen
// (sign-in), where the cover simply fades.
function toDock(cover: HTMLElement): number {
  const dock = document.querySelector<HTMLElement>('.kondo-floating-dock');
  const symbol = cover.querySelector<HTMLElement>('.boot-symbol');
  if (!dock || !symbol || !cover.animate) return 0;
  const d = dock.getBoundingClientRect(), p = symbol.getBoundingClientRect();
  if (!d.width || !d.height || !p.width) return 0;
  const style = getComputedStyle(cover);
  const dx = d.left + d.width / 2 - (p.left + p.width / 2), dy = d.top + d.height / 2 - (p.top + p.height / 2);
  const s = Math.min(1, d.height * 1.1 / p.height);
  const FALL = 820, LAND = .7, total = FALL + 240, landAt = FALL * LAND;
  const at = (x: number, y: number, sx: number, sy = sx) => `translate(${x}px, ${y}px) scale(${sx}, ${sy})`;
  cover.querySelector('.boot-name')?.animate([{opacity: 1}, {opacity: 0, filter: 'blur(4px)', transform: 'translateY(6px)'}], {duration: 260, easing: 'ease-in', fill: 'forwards'});
  // The mark is gone the moment it touches down; the dock takes over from there.
  symbol.animate([
    {transform: 'none', easing: 'cubic-bezier(.3,0,.4,1)'},
    {transform: at(0, -14, 1.03), offset: .2, easing: 'cubic-bezier(.55,0,.9,.4)'},
    {transform: at(dx, dy, s * .92, s * 1.08), offset: LAND, easing: 'ease-out', opacity: 1},
    {transform: at(dx, dy + 3, s * 1.25, s * .7), offset: LAND + .1, opacity: 0, filter: 'blur(4px)'},
    {transform: at(dx, dy + 3, s * 1.25, s * .7), opacity: 0, filter: 'blur(4px)'},
  ], {duration: FALL, fill: 'forwards'});
  cover.animate([{backgroundColor: style.backgroundColor}, {backgroundColor: 'transparent'}], {duration: 420, delay: 380, easing: 'ease-out', fill: 'forwards'});
  dock.animate([
    {opacity: 0, scale: '.6', filter: 'blur(6px)'},
    {opacity: 0, scale: '.6', filter: 'blur(6px)', offset: landAt / total, easing: 'cubic-bezier(.2,1.4,.4,1)'},
    {opacity: 1, scale: '1', filter: 'blur(0)'},
  ], {duration: total});
  document.getElementById('main-content')?.animate([{opacity: 0, transform: 'translateY(12px)'}, {opacity: 1, transform: 'none'}], {duration: 560, delay: 600, easing: 'cubic-bezier(.22,.72,.18,1)', fill: 'backwards'});
  return total;
}
