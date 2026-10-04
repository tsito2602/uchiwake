import { haptic } from './haptics';

export type ImportLanding = { from: DOMRect; colors: string[]; cardId?: string | null; tone?: string };

// Saved statements land where they now count: one drop per category, in its
// colour, arcs from the closing panel into the card's row, and the row takes
// them in with a short swell while its amount rolls to the new total.
export function landImport({ from, colors, cardId, tone }: ImportLanding) {
  if (!colors.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const row = (cardId && document.querySelector<HTMLElement>(`#main-content [data-card-id="${CSS.escape(cardId)}"]`))
    || document.querySelector<HTMLElement>('#main-content [data-card-id]');
  if (!row || !row.animate) return;
  const icon = row.querySelector<HTMLElement>('svg') ?? row;
  const to = icon.getBoundingClientRect();
  if (to.bottom < 0 || to.top > window.innerHeight) return;
  const tx = to.left + to.width / 2, ty = to.top + to.height / 2;
  const cx = from.left + from.width / 2, cy = from.top + Math.min(from.height * .45, 260);
  const DURATION = 620, STAGGER = 45;
  colors.slice(0, 7).forEach((color, index, list) => {
    const drop = document.createElement('div');
    drop.className = 'landing-drop';
    drop.style.background = color;
    document.body.appendChild(drop);
    // Start spread in a small fan, lift a little, then fall into the icon.
    const spread = (index - (list.length - 1) / 2) * 22;
    const sx = cx + spread, sy = cy + Math.abs(spread) * .3;
    const lift = Math.min(sy, ty) - 70;
    const at = (x: number, y: number, scale: number) => `translate(${x - 7}px, ${y - 7}px) scale(${scale})`;
    const animation = drop.animate([
      { transform: at(sx, sy, .2), opacity: 0 },
      { transform: at(sx, sy, 1), opacity: 1, offset: .14 },
      { transform: at((sx + tx) / 2, lift, 1.05), offset: .5 },
      { transform: at(tx, ty, .35), opacity: .9 },
    ], { duration: DURATION, delay: index * STAGGER, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'both' });
    animation.finished.then(() => drop.remove(), () => drop.remove());
  });
  const arrive = DURATION * .92;
  window.setTimeout(() => {
    haptic();
    row.animate([
      { transform: 'scale(1)', boxShadow: `0 0 0 0 color-mix(in srgb, ${tone ?? 'var(--ink)'} 40%, transparent)` },
      { transform: 'scale(1.025,1.04)', offset: .3 },
      { transform: 'scale(1)', boxShadow: `0 0 0 10px color-mix(in srgb, ${tone ?? 'var(--ink)'} 0%, transparent)` },
    ], { duration: 720, easing: 'cubic-bezier(.22,.72,.18,1)' });
  }, arrive);
}
