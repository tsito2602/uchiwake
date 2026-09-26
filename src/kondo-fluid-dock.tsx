// Adapted from tsito2602/kondo (MIT). Shared morphing dock surface.
import {
  useId,
  useImperativeHandle,
  useEffect,
  useRef,
  type Ref,
  type RefObject,
} from "react";
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
import { animateDockPress } from "./kondo-dock-surface";

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
  // Keep the add surface independent, while the white islands use the same
  // splitting/merging geometry as context navigation (no zero-sized shrink).
  const fromAdd = stableSlots ? from.find(island => island.slot === 2) : undefined;
  const toAdd = stableSlots ? to.find(island => island.slot === 2) : undefined;
  if (fromAdd && toAdd) {
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
  const simple = a.length === b.length && a.length <= 2;
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
) {
  if (t >= 1) return { islands: to, tension: 0 };
  if (t <= 0) return { islands: from, tension };
  const p = ease(t);
  const fadeOut = 1 - ease(Math.min(1, (t * 600) / 140));
  const fadeIn = ease(Math.max(0, Math.min(1, (t * 600 - 180) / 240)));
  return {
    islands: plan.from.map((island, i) => ({
      left: island.left + (plan.to[i].left - island.left) * p,
      width: island.width + (plan.to[i].width - island.width) * p,
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
      tension * (1 - p) + (plan.simple ? 0 : 1800 * Math.sin(Math.PI * p) ** 2),
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
  const width = useRef(0);
  const height = useRef(56);
  const frame = useRef(0);
  const morph = useRef<{
    from: DockIsland[];
    to: DockIsland[];
    tension: number;
    start: number;
    plan: DockMorphPlan;
  } | null>(null);
  const presses = useRef(
    new Map<
      HTMLElement,
      {
        from: DockScale;
        to: DockScale;
        start: number;
        duration: number;
        animation?: Animation;
      }
    >(),
  );
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
    const scales = islands.map((island, i) => {
      const scale=pressScale(controls.current[island.slot ?? i] ?? null, performance.now());
      const add=(island.slot??i)===2&&root.current?.dataset.mode==='browse'?addScale.current:1;
      return {x:scale.x*add,y:scale.y*add};
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
  const pressScale = (element: HTMLElement | null, now: number): DockScale => {
    const track = element && presses.current.get(element);
    if (!track) return { x: 1, y: 1 };
    const t = Math.min(1, Math.max(0, (now - track.start) / track.duration));
    // WAAPI already knows the eased progress; this does not flush style/layout.
    const p =
      t >= 1
        ? 1
        : (track.animation?.effect?.getComputedTiming().progress ?? ease(t));
    return {
      x: track.from.x + (track.to.x - track.from.x) * p,
      y: track.from.y + (track.to.y - track.from.y) * p,
    };
  };
  const tick = (now: number) => {
    frame.current = 0;
    if (morph.current) {
      const m = morph.current;
      const t = Math.min(1, Math.max(0, (now - m.start) / 600));
      shape.current = morphDock(m.from, m.to, m.tension, t, m.plan);
      if (t >= 1) morph.current = null;
    }
    let pressing = false;
    for (const [element, track] of presses.current) {
      if (!element.isConnected) {
        presses.current.delete(element);
        continue;
      }
      if (now - track.start < track.duration) pressing = true;
      else if (track.to.x === 1 && track.to.y === 1)
        presses.current.delete(element);
    }
    paint();
    if (morph.current || pressing) frame.current = requestAnimationFrame(tick);
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
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      shape.current = { islands, tension: 0 };
      paint();
      return;
    }
    // Interrupted transitions start at the exact rendered geometry, not a layout
    // endpoint. Both the glass mask and its border use that same contour.
    morph.current = {
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
    let pressed: HTMLElement | null = null;
    let pointerId: number | null = null;
    const animations = new Map<HTMLElement, Animation>();
    const feedback = (element: HTMLElement, down: boolean) => {
      const motion = animateDockPress(element, down, animations.get(element));
      if (motion) {
        animations.set(element, motion);
        void motion.finished.then(
          () => {
            if (!down && animations.get(element) === motion) animations.delete(element);
          },
          () => {},
        );
      }
      const style = window.getComputedStyle(element);
      const matrix = style.transform
        .match(/^matrix\(([^)]+)\)$/)?.[1]
        .split(",")
        .map(Number);
      const from = matrix
        ? { x: matrix[0], y: matrix[3] }
        : pressScale(element, performance.now());
      const x = down
        ? parseFloat(style.getPropertyValue("--safari-press-scale")) || 1.06
        : 1;
      element.dataset.pressed = String(down);
      if (reduceMotion()) presses.current.delete(element);
      else
        presses.current.set(element, {
          from,
          to: { x, y: down ? 1.1 : 1 },
          start: performance.now(),
          duration: down ? 320 : 900,
          animation: motion,
        });
      paint();
      if (!reduceMotion()) schedule();
    };
    const release = () => {
      if (pressed) feedback(pressed, false);
      pressed = null;
      pointerId = null;
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      const target = event.target as HTMLElement;
      const element = target.closest<HTMLElement>(".context-island, .safari-dock, .dock-month, .dock-add");
      if (!element || target.closest("[disabled], [inert], [data-outgoing]"))
        return;
      release();
      pressed = element;
      pointerId = event.pointerId;
      feedback(element, true);
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId === pointerId) release();
    };
    const out = (event: PointerEvent) => {
      if (
        event.pointerId === pointerId &&
        !pressed?.contains(event.relatedTarget as Node | null)
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
      animations.forEach((animation) => animation.cancel());
      presses.current.clear();
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
