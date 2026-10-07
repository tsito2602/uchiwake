// Adapted from tsito2602/kondo (MIT). Shared morphing dock surface.
import {
  useId,
  useImperativeHandle,
  useEffect,
  useRef,
  type Ref,
  type RefObject,
} from "react";
import { LiveSpring, springSamples } from "./cartoon-motion";
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export type DockIsland = {
  left: number;
  width: number;
  radius: number;
  slot?: number;
  tint?: number;
  blend?: boolean;
};
const samples = 320;
const ease = (t: number) => 1 - (1 - t) ** 3;
export const MORPH_MS = 600;

/** kondo's dock (cartoon-dock.tsx): the fluid dock's path on a near-critically
    damped spring, so the islands glide into their new shape and stop without
    a wobble. */
const JELLY = springSamples({ stiffness: 300, damping: 34 });
export const MORPH = Math.max(MORPH_MS, JELLY.duration);
export const jelly = (t: number) => {
  const at = t * (JELLY.values.length - 1),
    i = Math.floor(at);
  if (i >= JELLY.values.length - 1) return 1;
  return JELLY.values[i] + (JELLY.values[i + 1] - JELLY.values[i]) * (at - i);
};

/** Three overlapping lobes make one capsule, with no internal seams. */
export function joinedDock(width: number, radius = 32): DockIsland[] {
  return [
    { left: 0, width: width / 3 + radius, radius },
    { left: width / 3 - radius, width: width / 3 + radius * 2, radius },
    { left: (width * 2) / 3 - radius, width: width / 3 + radius, radius },
  ];
}

/** Absent controls dissolve into the closest surviving surface. */
export function dockSlots(
  width: number,
  slots: (DockIsland | null)[],
): DockIsland[] {
  const present = slots.filter((slot): slot is DockIsland => Boolean(slot));
  return slots.map((slot, index) => {
    if (slot) return slot;
    const anchor = (width * index) / Math.max(1, slots.length - 1);
    const points = present.map(({ left, width: w, radius: r }) =>
      Math.max(left + r, Math.min(left + w - r, anchor)),
    );
    const point =
      points.sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor))[0] ??
      width / 2;
    return { left: point, width: 0, radius: 0 };
  });
}

/** Reduce representation-only lobes to the actual visible capsule. */
function visibleDock(islands: DockIsland[]) {
  const result: DockIsland[] = [];
  for (const island of islands
    .filter((item) => item.width > 0 && item.radius > 0)
    .sort((a, b) => a.left - b.left)) {
    const previous = result.at(-1);
    if (
      previous &&
      previous.blend === undefined &&
      island.blend === undefined &&
      previous.radius === island.radius &&
      (previous.tint ?? 0) === (island.tint ?? 0) &&
      previous.slot === island.slot &&
      island.left + island.radius <=
        previous.left + previous.width - previous.radius + 0.001
    ) {
      previous.width =
        Math.max(previous.left + previous.width, island.left + island.width) -
        previous.left;
    } else result.push({ ...island });
  }
  return result;
}

type DockMorphPlan = { from: DockIsland[]; to: DockIsland[]; simple: boolean; stableSlots?: boolean };

/** Split along a capsule's straight spine; the pieces still draw the exact same surface. */
function splitDock(donors: DockIsland[], references: DockIsland[]) {
  let best: DockIsland[] = [],
    bestCost = Infinity;
  const allocate = (counts: number[], remaining: number) => {
    if (counts.length < donors.length - 1) {
      for (
        let count = 1;
        count <= remaining - (donors.length - counts.length - 1);
        count++
      )
        allocate([...counts, count], remaining - count);
      return;
    }
    const allocation = [...counts, remaining];
    const parts: DockIsland[] = [];
    let offset = 0,
      cost = 0;
    donors.forEach((donor, i) => {
      const group = references.slice(offset, offset + allocation[i]);
      const first = group[0],
        last = group.at(-1)!;
      cost +=
        Math.abs(donor.left - first.left) +
        Math.abs(donor.left + donor.width - last.left - last.width);
      const radius = Math.min(donor.radius, donor.width / 2);
      const start = donor.left + radius,
        end = donor.left + donor.width - radius;
      const cuts = [start];
      for (let j = 1; j < group.length; j++) {
        const left = group[j - 1],
          right = group[j];
        const seam =
          (left.left + left.width - left.radius + right.left + right.radius) /
          2;
        cuts.push(Math.max(cuts.at(-1)!, Math.min(end, seam)));
      }
      cuts.push(end);
      for (let j = 0; j < group.length; j++)
        parts.push({
          ...donor,
          left: cuts[j] - radius,
          width: cuts[j + 1] - cuts[j] + radius * 2,
          radius,
        });
      offset += group.length;
    });
    if (cost < bestCost) {
      best = parts;
      bestCost = cost;
    }
  };
  allocate([], references.length);
  return best;
}

/** Correspond by visible position, expanding/splitting existing material, never a zero-sized slot. */
export function prepareDockMorph(
  from: DockIsland[],
  to: DockIsland[],
  stableSlots = false,
): DockMorphPlan {
  // Keep the add surface independent only while present on both screens.
  // When it enters or leaves, merge/split the actual capsule geometry instead
  // of shrinking a missing slot to zero.
  const fromAdd = stableSlots ? from.find(island => island.slot === 2) : undefined;
  const toAdd = stableSlots ? to.find(island => island.slot === 2) : undefined;
  if (fromAdd && toAdd && fromAdd.width > 0 && toAdd.width > 0) {
    const neutral = prepareDockMorph(
      from.filter(island => island.slot !== 2),
      to.filter(island => island.slot !== 2),
    );
    return {
      ...neutral,
      from: [...neutral.from, { ...fromAdd, blend: false }],
      to: [...neutral.to, { ...toAdd, blend: false }],
      stableSlots: true,
    };
  }
  let a = visibleDock(from),
    b = visibleDock(to);
  // The same number of islands only move and resize: they keep their order
  // and their gaps, so no neck is needed (as in kondo).
  const simple = a.length === b.length;
  if (!a.length || !b.length) return { from, to, simple };
  if (a.length < b.length) a = splitDock(a, b);
  else if (b.length < a.length) b = splitDock(b, a);
  return { from: a, to: b, simple };
}

export function morphDock(
  from: DockIsland[],
  to: DockIsland[],
  tension: number,
  t: number,
  plan = prepareDockMorph(from, to),
  /** Progress along the move; may overshoot 1 for a springy landing. */
  curve: (t: number) => number = ease,
) {
  if (t >= 1) return { islands: to, tension: 0 };
  if (t <= 0) return { islands: from, tension };
  const p = curve(t);
  const fadeOut = 1 - ease(Math.min(1, (t * MORPH_MS) / 140));
  const fadeIn = ease(Math.max(0, Math.min(1, (t * MORPH_MS - 180) / 240)));
  return {
    islands: plan.from.map((island, i) => ({
      left: island.left + (plan.to[i].left - island.left) * p,
      // Past the target the edges may overshoot, but an island never gets
      // narrower than both of its shapes.
      width: Math.max(
        island.width + (plan.to[i].width - island.width) * p,
        p > 1 ? Math.min(island.width, plan.to[i].width) : 0,
      ),
      radius: island.radius + (plan.to[i].radius - island.radius) * p,
      slot: plan.to[i].slot,
      blend:
        Math.abs(plan.to[i].left - island.left) > 0.001 ||
        Math.abs(plan.to[i].width - island.width) > 0.001 ||
        (tension > 0 && island.blend !== false),
      tint: plan.stableSlots
        ? (island.tint ?? 0) + ((plan.to[i].tint ?? 0) - (island.tint ?? 0)) * p
        : (island.tint ?? 0) * fadeOut + (plan.to[i].tint ?? 0) * fadeIn,
    })),
    tension:
      tension * (1 - p) +
      (plan.simple ? 0 : 1800 * Math.sin(Math.PI * Math.min(1, p)) ** 2),
  };
}

/** A capsule's horizontal slice: y² < field(x). Negative values are real gaps. */
export function dockField(
  width: number,
  islands: DockIsland[],
  tension = 0,
  scales: { x: number; y: number }[] = [],
) {
  const ceiling = Math.max(
    ...islands.map((island, i) => (island.radius * (scales[i]?.y ?? 1)) ** 2),
  );
  const cores = islands.flatMap((island, i) => {
    if (island.width <= 0 || island.radius <= 0) return [];
    const sx = scales[i]?.x ?? 1;
    const r = Math.min(island.radius, island.width / 2);
    const center = island.left + island.width / 2;
    return [
      center - (island.width / 2 - r) * sx,
      center + (island.width / 2 - r) * sx,
    ];
  });
  const leftCore = Math.min(...cores),
    rightCore = Math.max(...cores);
  return Array.from({ length: samples + 1 }, (_, i) => {
    const x = (i / samples) * width;
    let value = -width * width;
    let stationary = -width * width;
    let plain = -width * width;
    for (const [index, island] of islands.entries()) {
      const { x: sx, y: sy } = scales[index] ?? { x: 1, y: 1 };
      const localX =
        (x - island.left - island.width / 2) / sx +
        island.left +
        island.width / 2;
      const r = Math.min(island.radius, island.width / 2);
      if (r <= 0) continue;
      const dx = Math.max(
        island.left + r - localX,
        0,
        localX - (island.left + island.width - r),
      );
      const next = (r * r - dx * dx) * sy * sy;
      plain = Math.max(plain, next);
      if (island.blend === false) {
        stationary = Math.max(stationary, next);
        continue;
      }
      // Smooth union draws a neck between nearby droplets, without double blur
      // or a border through the join. Distant islands remain separate.
      const h = tension
        ? Math.max(tension - Math.abs(value - next), 0) / tension
        : 0;
      value = Math.max(value, next) + h * h * tension * 0.25;
    }
    // Neck smoothing only joins inner edges, never inflates the outside edge.
    return Math.min(
      x < leftCore || x > rightCore ? plain : Math.max(value, stationary),
      ceiling,
    );
  });
}

/** Trace one closed contour per connected region, including subpixel pinch-off. */
export function dockFieldPath(width: number, field: number[], center = 32) {
  const step = width / (field.length - 1);
  const contours: string[] = [];
  let points: [number, number][] = [];
  const point = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  const close = () => {
    if (points.length < 2) {
      points = [];
      return;
    }
    contours.push(
      `M ${points.map(([x, y]) => point(x, center - y)).join(" L ")} L ${points
        .reverse()
        .map(([x, y]) => point(x, center + y))
        .join(" L ")} Z`,
    );
    points = [];
  };
  for (let i = 0; i < field.length; i++) {
    const v = field[i];
    const prev = field[i - 1];
    if (v >= 0) {
      if (prev < 0) points.push([(i - 1 + -prev / (v - prev)) * step, 0]);
      points.push([i * step, Math.sqrt(v)]);
    } else if (prev >= 0) {
      points.push([(i - 1 + prev / (prev - v)) * step, 0]);
      close();
    }
  }
  close();
  return contours.join(" ");
}

type DockScale = { x: number; y: number };

/** Exact arcs for simple capsules; sample a field only during an actual neck. */
export function dockContour(
  width: number,
  islands: DockIsland[],
  tension = 0,
  scales: DockScale[] = [],
  center = 32,
) {
  if (!islands.length) return "";
  // An independent surface (such as the add accent) has no neck to sample.
  if (islands.every(island => island.blend === false)) tension = 0;
  if (tension > 0)
    return dockFieldPath(
      width,
      dockField(width, islands, tension, scales),
      center,
    );
  const capsules = islands
    .flatMap((island, i) => {
      if (island.width <= 0 || island.radius <= 0) return [];
      const { x, y } = scales[i] ?? { x: 1, y: 1 };
      const r = Math.min(island.radius, island.width / 2);
      return [
        {
          left: island.left + (island.width * (1 - x)) / 2,
          right: island.left + (island.width * (1 + x)) / 2,
          rx: r * x,
          ry: r * y,
        },
      ];
    })
    .sort((a, b) => a.left - b.left);
  const merged: typeof capsules = [];
  for (const capsule of capsules) {
    const previous = merged.at(-1);
    if (previous && capsule.left < previous.right) {
      if (
        Math.abs(capsule.rx - previous.rx) < 0.001 &&
        Math.abs(capsule.ry - previous.ry) < 0.001 &&
        capsule.left + capsule.rx <= previous.right - previous.rx + 0.001
      ) {
        previous.right = Math.max(previous.right, capsule.right);
        continue;
      }
      return dockFieldPath(
        width,
        dockField(width, islands, tension, scales),
        center,
      );
    }
    merged.push({ ...capsule });
  }
  const n = (value: number) => Number(value.toFixed(3));
  return merged
    .map(({ left, right, rx, ry }) => {
      const top = center - ry,
        bottom = center + ry;
      return `M ${n(left + rx)} ${n(top)} H ${n(right - rx)} A ${n(rx)} ${n(ry)} 0 0 1 ${n(right)} ${n(center)} A ${n(rx)} ${n(ry)} 0 0 1 ${n(right - rx)} ${n(bottom)} H ${n(left + rx)} A ${n(rx)} ${n(ry)} 0 0 1 ${n(left)} ${n(center)} A ${n(rx)} ${n(ry)} 0 0 1 ${n(left + rx)} ${n(top)} Z`;
    })
    .join(" ");
}

export type FluidDockHandle = { measure: () => void };

/** Lives in the provider, so routes and nested dialogs never replace the glass. */
export function FluidDockSurface({
  root,
  ref,
  addOpen = false,
}: {
  root: RefObject<HTMLDivElement | null>;
  addOpen?: boolean;
  ref: Ref<FluidDockHandle>;
}) {
  const glass = useRef<HTMLDivElement>(null);
  const material = useRef<SVGPathElement>(null);
  const accent = useRef<SVGPathElement>(null);
  const outline = useRef<SVGPathElement>(null);
  const shadow = useRef<SVGPathElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const shape = useRef<{ islands: DockIsland[]; tension: number } | null>(null);
  const target = useRef("");
  const measuredMode = useRef<string | undefined>(undefined);
  const selectionKind = useRef<string|null>(null);
  const width = useRef(0);
  const height = useRef(56);
  const frame = useRef(0);
  const morph = useRef<{
    from: DockIsland[];
    to: DockIsland[];
    tension: number;
    start: number;
    plan: DockMorphPlan;
    revealSelection: boolean;
  } | null>(null);
  /** The pressed island (its slot) and its squish, and the whole dock's
      crouch around a morph: kondo's Q and J, both scale (2-v, v). */
  const pressed = useRef(-1);
  const rise = useRef<ReturnType<typeof setTimeout>>(undefined);
  const squish = useRef<LiveSpring | null>(null);
  const crouch = useRef<LiveSpring | null>(null);
  squish.current ??= new LiveSpring(1, () => paint(), { stiffness: 600, damping: 18 });
  crouch.current ??= new LiveSpring(1, () => paint(), { stiffness: 600, damping: 18 });
  const lastPath = useRef("");
  const lastAccentPath = useRef("");

  const addScale = useRef(1);
  const controls = useRef<(HTMLElement | null)[]>([]);
  const id = useId();
  const paint = () => {
    if (!shape.current || !glass.current) return;
    const w = width.current + 24;
    const islands = shape.current.islands.map((island) => ({
      ...island,
      left: island.left + 12,
    }));
    const browsing = root.current?.dataset.mode === 'browse';
    const scales = islands.map((island, i) => {
      const slot = island.slot ?? i;
      // The add button stays put through a morph, like kondo's ＋ beside its dock.
      const stable = browsing && slot === 2;
      const add = stable ? addScale.current : 1;
      const v = (stable ? 1 : crouch.current!.value) * (slot === pressed.current ? squish.current!.value : 1);
      if (Math.abs(v - 1) <= 0.0005) return { x: add, y: add };
      // A squish widens an island, but never into a separate neighbour.
      const gap = Math.min(
        ...islands.map((other) =>
          other === island || other.width <= 0
            ? Infinity
            : Math.max(
                other.left - island.left - island.width,
                island.left - other.left - other.width,
              ),
        ),
      );
      const room =
        gap > 0 && island.width > 0 ? 1 + (gap - 6) / island.width : Infinity;
      return { x: Math.min(2 - v, Math.max(1, room)) * add, y: v * add };
    });
    const center = height.current / 2 + 12;
    const d = dockContour(w, islands, shape.current.tension, scales, center);
    if (d !== lastPath.current) {
      glass.current.style.clipPath = `path("${d}")`;
      material.current!.setAttribute("d", d);
      outline.current!.setAttribute("d", d);
      shadow.current!.setAttribute("d", d);
      lastPath.current = d;
    }
    const tinted = islands
      .map((island, i) => ({ island, scale: scales[i] }))
      .filter(({ island }) => (island.tint ?? 0) > 0);
    const a = dockContour(
      w,
      tinted.map(({ island }) => island),
      shape.current.tension,
      tinted.map(({ scale }) => scale),
      center,
    );
    if (accent.current) {
      if (a !== lastAccentPath.current) {
        accent.current.setAttribute("d", a);
        lastAccentPath.current = a;
      }
      accent.current.style.opacity = String(
        Math.max(0, ...tinted.map(({ island }) => island.tint ?? 0)),
      );
    }
  };
  useEffect(()=>{
    const from=addScale.current,to=addOpen?.001:1;
    if(reduceMotion()){addScale.current=to;paint();return;}
    const start=performance.now();let frame=0;
    const tick=(now:number)=>{const t=Math.min(1,(now-start)/160);addScale.current=from+(to-from)*ease(t);paint();if(t<1)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame);
  },[addOpen]);
  const tick = (now: number) => {
    frame.current = 0;
    if (morph.current) {
      const m = morph.current;
      const t = Math.min(1, Math.max(0, (now - m.start) / MORPH));
      shape.current = morphDock(m.from, m.to, m.tension, t, m.plan, jelly);
      // Fade selection fills over the final 240ms, on the same clock as the contour.
      const reveal=Math.min(1,Math.max(0,(t-.6)/.4));
      if(m.revealSelection)root.current?.style.setProperty('--dock-selection-reveal',String(reveal*reveal*(3-2*reveal)));
      if (t >= 1) {
        morph.current = null;
        if(root.current)root.current.dataset.morphing='false';
        // Landed: the dock rises and simply stops, nothing wobbles.
        clearTimeout(rise.current);
        crouch.current!.to(1, { stiffness: 420, damping: 41 });
      }
    }
    paint();
    if (morph.current) frame.current = requestAnimationFrame(tick);
  };
  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(tick);
  };

  const measure = () => {
    const node = root.current;
    if (!node) return;
    const w = node.clientWidth;
    if (!w) return; // Hidden desktop dock or a host not yet in the top layer.
    const content = node.querySelector<HTMLElement>(
      ".thumb-dock-content:not([data-outgoing])",
    );
    const tabs = content?.querySelector<HTMLElement>(".safari-dock");
    const nextSelection=tabs?'tabs':content?.querySelector('.category-entries-modes')?'groups':content?.querySelector('.entry-sort-controls')?'sorts':null;
    const revealSelection=!!nextSelection&&nextSelection!==selectionKind.current;
    selectionKind.current=nextSelection;
    // All three browse surfaces participate in the same persistent material:
    // Context actions may split into four islands; measure each visible island.
    controls.current = tabs
      ? [tabs, content?.querySelector<HTMLElement>(".dock-month") ?? null,
          content?.querySelector<HTMLElement>(".dock-add") ?? null]
      : Array.from(content?.querySelectorAll<HTMLElement>(".context-island") ?? []);
    const h = node.clientHeight || 56;
    const radius = h / 2;
    const bounds = node.getBoundingClientRect();
    const scale = bounds.width / w || 1;
    const slots = controls.current.map(element => element ? {
      left: Math.round(((element.getBoundingClientRect().left - bounds.left) / scale +
        (element.getBoundingClientRect().width / scale - element.offsetWidth) / 2) * 100) / 100,
      width: element.offsetWidth,
      radius,
    } : null);
    const islands = (slots.some(Boolean) ? dockSlots(w, slots) : joinedDock(w, radius))
      .map((island, i) => ({
        ...island,
        slot: i,
        tint: controls.current[i] && (tabs ? i === 2 : controls.current[i]?.dataset.commit === "true") ? 1 : 0,
      }));
    node.style.setProperty(
      "--safari-press-scale",
      String(Math.max(1, Math.min(1.06, (window.innerWidth - 8) / w))),
    );
    const key = JSON.stringify([w, h, islands]);
    const stableSlots = measuredMode.current === 'browse' && node.dataset.mode === 'browse';
    measuredMode.current = node.dataset.mode;
    if (key === target.current) {
      paint();
      return;
    }
    target.current = key;
    const from = shape.current;
    const resized = width.current !== w || height.current !== h;
    width.current = w;
    height.current = h;
    svg.current!.setAttribute("viewBox", `0 0 ${w + 24} ${h + 24}`);
    if (!from || resized || reduceMotion()) {
      morph.current = null;
      node.dataset.morphing='false';
      node.style.setProperty('--dock-selection-reveal','1');
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      shape.current = { islands, tension: 0 };
      paint();
      return;
    }
    // Interrupted transitions start at the exact rendered geometry, not a layout
    // endpoint. Both the glass mask and its border use that same contour.
    node.dataset.morphing='true';
    // kondo pops the selection with its own control instead of fading it in late.
    node.style.setProperty('--dock-selection-reveal','1');
    // The dock crouches as the material starts to move and rises with it
    // (kondo: J .92 on k700/d26, back to 1 on k420/d41 after 70 ms).
    crouch.current!.to(0.92, { stiffness: 700, damping: 26 });
    clearTimeout(rise.current);
    rise.current = setTimeout(() => crouch.current!.to(1, { stiffness: 420, damping: 41 }), 70);
    morph.current = {
      revealSelection: revealSelection && false,
      from: from.islands,
      to: islands,
      tension: from.tension,
      start: performance.now(),
      plan: prepareDockMorph(from.islands, islands, stableSlots),
    };
    schedule();
  };
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let held: HTMLElement | null = null;
    let pointerId: number | null = null;
    // kondo: pressing anywhere on an island squishes the whole island
    // (.95 on k600/d22, back on k420/d12); the add circle squishes as kondo's ＋
    // (.88, back on k420/d13). The controls on it squish on their own.
    const feedback = (element: HTMLElement, down: boolean) => {
      const add = element.matches(".dock-add");
      element.dataset.pressed = String(down);
      if (down) pressed.current = controls.current.indexOf(element);
      if (reduceMotion()) {
        if (!down) pressed.current = -1;
        squish.current!.set(1);
        return;
      }
      if (down) squish.current!.to(add ? 0.88 : 0.95, { stiffness: 600, damping: 22 });
      else squish.current!.to(1, { stiffness: 420, damping: add ? 13 : 12 });
    };
    const release = () => {
      if (held) feedback(held, false);
      held = null;
      pointerId = null;
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      const target = event.target as HTMLElement;
      const element = target.closest<HTMLElement>(".context-island, .safari-dock, .dock-month, .dock-add");
      if (!element || target.closest("[disabled], [inert], [data-outgoing]"))
        return;
      release();
      held = element;
      pointerId = event.pointerId;
      feedback(element, true);
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId === pointerId) release();
    };
    const out = (event: PointerEvent) => {
      if (
        event.pointerId === pointerId &&
        !held?.contains(event.relatedTarget as Node | null)
      )
        release();
    };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointerout", out);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", release);
    return () => {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointerout", out);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", release);
      squish.current!.stop();
      crouch.current!.stop();
      clearTimeout(rise.current);
    };
  }, []);
  useImperativeHandle(ref, () => ({ measure }));
  useEffect(() => {
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    if (root.current) observer?.observe(root.current);
    // Hold expansion changes within SafariTabs without updating the registry.
    const mutations = new window.MutationObserver(measure);
    if (root.current)
      mutations.observe(root.current, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-wide"],
      });
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(frame.current);
    };
  }, []);
  return (
    <div className="thumb-dock-material safari-surface" aria-hidden="true">
      <div ref={glass} className="safari-glass" />
      <svg ref={svg} width="100%" height="80" preserveAspectRatio="none">
        <defs>
          <filter
            id={`${id}-shadow`}
            x="-20%"
            y="-50%"
            width="140%"
            height="220%"
          >
            <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
            <feOffset dy="5" />
            <feComposite in2="SourceAlpha" operator="out" />
          </filter>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--dock-border-top)" />
            <stop offset="1" stopColor="var(--dock-border-bottom)" />
          </linearGradient>
        </defs>
        <path
          ref={shadow}
          fill="black"
          opacity="0.18"
          filter={`url(#${id}-shadow)`}
        />
        {/* Paint color with the actual contour, never a clipped rectangle.
            Safari can rebuild backdrop layers while taking route snapshots. */}
        <path ref={material} fill="var(--dock-glass)" />
        <path ref={accent} fill="var(--brand)" opacity="0" />
        <path
          ref={outline}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
