import { initializeTheme, THEME_EVENT } from './theme';
import { BALL, BALL_EDGE, BOOT_HOLD_END, BOOT_EXIT_DURATION, BRAND_THEMES, drawBrand, drawMelt, type BrandTheme } from './brand-motion';

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

// Adapted from uchino: the mark itself becomes a ball of ink that drops into
// the bottom navigation. On the canvas the slices slide together into one
// solid disc (drawMelt); that disc is handed to an element of the same size,
// which squashes, stretches as it falls, lands, and spreads into the dock.
// Returns how long the handover runs, or 0 when there is no dock on screen
// (sign-in), where the cover simply fades.
function toDock(cover: HTMLElement): number {
  const dock = document.querySelector<HTMLElement>('.kondo-floating-dock');
  const symbol = cover.querySelector<HTMLElement>('.boot-symbol');
  if (!dock || !symbol || !cover.animate) return 0;
  const d = dock.getBoundingClientRect(), p = symbol.getBoundingClientRect();
  if (!d.width || !d.height || !p.width) return 0;
  const style = getComputedStyle(cover), ink = BRAND_THEMES[theme].ink;
  // The canvas draws 1750 logo units across 340px from (-82, -101) in the symbol box.
  const unit = p.width / 176 * 340 / 1750;
  const bx = p.left - 82 / 176 * p.width + (248 + BALL.x) * unit, by = p.top - 101 / 142 * p.height + (240 + BALL.y) * unit, r = BALL_EDGE * unit;
  const MELT = 300, FALL = 720, total = MELT + FALL + 60, landAt = MELT + FALL * .8;
  cover.querySelector('.boot-name')?.animate([{opacity: 1}, {opacity: 0, filter: 'blur(4px)', transform: 'translateY(6px)'}], {duration: 220, easing: 'ease-in', fill: 'forwards'});
  if (ctx && canvas) {
    const begun = performance.now();
    const melt = (now: number) => {
      const m = Math.min(1, (now - begun) / MELT);
      drawMelt(ctx, canvas.width, canvas.height, m, theme);
      if (m < 1) requestAnimationFrame(melt);
    };
    melt(begun);
  }
  symbol.animate([{opacity: 1}, {opacity: 0}], {duration: 1, delay: MELT, fill: 'forwards'});
  const drop = document.createElement('div');
  drop.style.cssText = `position:fixed;left:0;top:0;opacity:0;background:${ink};pointer-events:none`;
  cover.appendChild(drop);
  const box = (left: number, top: number, width: number, height: number) =>
    ({left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, borderRadius: `${Math.min(width, height) / 2}px`});
  drop.animate([
    {...box(bx - r, by - r, r * 2, r * 2), opacity: 1},
    {...box(bx - r * 1.14, by - r * .7, r * 2.28, r * 1.7), offset: .12},
    {...box(bx - r * .72, by - r * .9, r * 1.44, r * 2.5), offset: .3},
    {...box(bx - 40, d.top - 30, 80, 76), offset: .56},
    {...box(d.left - 8, d.top + 4, d.width + 16, d.height - 8), offset: .8, opacity: 1},
    {...box(d.left, d.top, d.width, d.height), opacity: 0},
  ], {duration: FALL, delay: MELT, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards'});
  cover.animate([{backgroundColor: style.backgroundColor}, {backgroundColor: 'transparent'}], {duration: 400, delay: MELT + 200, easing: 'ease-out', fill: 'forwards'});
  dock.animate([{opacity: 0}, {opacity: 0, offset: landAt / total}, {opacity: 1}], {duration: total});
  document.getElementById('main-content')?.animate([{opacity: 0, transform: 'translateY(12px)'}, {opacity: 1, transform: 'none'}], {duration: 520, delay: MELT + 360, easing: 'cubic-bezier(.22,.72,.18,1)', fill: 'backwards'});
  return total;
}
