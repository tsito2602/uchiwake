// Adapted from tsito2602/kondo (MIT). Swaps the dock's controls as kondo's
// cartoon dock does (cartoon-dock.tsx): what leaves fades out in place over
// 120 ms; each island that arrives fades in over 140 ms after 80 ms while its
// controls pop from 0.4 one after another (k380/d13, 110 ms + 45 ms each).
// Islands that stay (the back circle, the tab row) do not move.
import { Component, createRef, type ReactNode } from "react";
import { springAnimate } from "./cartoon-motion";
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Props = { identity: string; mode: string; children: ReactNode };

/** The islands of one dock layout: each pops in as a group. */
const ISLANDS = ".context-island, .safari-dock, .dock-month, .dock-add";
const islandsOf = (node: HTMLElement) =>
  [...node.querySelectorAll<HTMLElement>(ISLANDS)].filter(
    (island) => !island.parentElement?.closest(ISLANDS),
  );
/** As kondo's keyOf: the back circle and the browse islands keep their place;
    context actions belong to the screen that put them there. */
const keyOf = (island: HTMLElement, identity: string, mode: string) =>
  mode === "browse"
    ? `browse:${island.classList[0]}`
    : island.matches(".context-back")
      ? "back"
      : `${island.className}|${identity}`;
const POP = { stiffness: 380, damping: 13 };
const popFrames = [
  { transform: "scale(.4)", opacity: 0 },
  { transform: "none", opacity: 1 },
];

function popIn(group: HTMLElement) {
  const animations: Animation[] = [];
  const fade = group.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 140,
    delay: 80,
    easing: "ease",
    fill: "backwards",
  });
  animations.push(fade);
  const parts = group.matches("button")
    ? [group]
    : [...group.children].filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement &&
          !child.matches(".dock-selection, .haptic-touch"),
      );
  const pop = (element: Element, index: number) => {
    const animation = springAnimate(element, popFrames[0], popFrames[1], POP, {
      delay: 110 + index * 45,
      fill: "backwards",
    });
    if (animation) animations.push(animation);
  };
  parts.forEach(pop);
  // The selection pill pops with its own tab, so it never shows empty while
  // a tab further along is still on its way in.
  const on = parts.findIndex((part) => part.matches('[aria-current="page"], [aria-pressed="true"]'));
  const pill = group.querySelector<HTMLElement>(":scope > .dock-selection");
  if (pill && on >= 0) pop(pill, on);
  return animations;
}

/** Keep only an inert visual copy of outgoing controls; their handlers expire immediately. */
export class DockContent extends Component<Props> {
  node = createRef<HTMLDivElement>();
  outgoing?: HTMLElement;
  animations: Animation[] = [];
  recovery?: ReturnType<typeof setTimeout>;

  getSnapshotBeforeUpdate(previous: Props) {
    if (previous.identity === this.props.identity || reduceMotion())
      return null;
    const node = this.node.current;
    if (!node?.animate) return null;
    // React may reuse an island's node for the next layout, so keep a copy of
    // what is showing now to fade the leaving islands out in place.
    const copy = node.cloneNode(true) as HTMLElement;
    copy.dataset.outgoing = "true";
    copy.inert = true;
    copy.setAttribute("aria-hidden", "true");
    for (const element of [copy, ...copy.querySelectorAll("*")]) {
      for (const attribute of ["id", "name", "form", "href", "autofocus"])
        element.removeAttribute(attribute);
    }
    const keys = islandsOf(node).map((island) =>
      keyOf(island, previous.identity, previous.mode),
    );
    return { copy, keys };
  }

  componentDidUpdate(
    previous: Props,
    _state: unknown,
    before: { copy: HTMLElement; keys: string[] } | null,
  ) {
    if (previous.identity === this.props.identity) return;
    this.clear();
    const node = this.node.current;
    if (!before || !node) return;
    const now = islandsOf(node).map((island) => ({
      island,
      key: keyOf(island, this.props.identity, this.props.mode),
    }));
    const keys = new Set(now.map(({ key }) => key));
    const old = new Set(before.keys);
    const { copy } = before;
    // Only the islands that leave fade out; the ones that stay are not doubled.
    islandsOf(copy).forEach((island, i) => {
      if (keys.has(before.keys[i])) island.style.visibility = "hidden";
    });
    if (before.keys.some((key) => !keys.has(key))) {
      this.outgoing = copy;
      node.parentElement!.appendChild(copy);
      const exit = copy.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 120,
        easing: "ease",
        fill: "forwards",
      });
      void exit.finished.then(
        () => copy.remove(),
        () => copy.remove(),
      );
      this.animations.push(exit);
    }
    const arriving = now.filter(({ key }) => !old.has(key));
    if (!arriving.length) return;
    // Handlers of a new layout wait for it; the browse tabs never stop answering.
    node.inert = previous.mode !== "browse" || this.props.mode !== "browse";
    for (const { island } of arriving) this.animations.push(...popIn(island));
    // The new controls answer once they are visible (140 ms after 80 ms).
    this.recovery = setTimeout(() => {
      if (this.node.current) this.node.current.inert = false;
    }, 220);
  }

  clear() {
    clearTimeout(this.recovery);
    if (this.node.current) this.node.current.inert = false;
    for (const animation of this.animations.splice(0)) animation.cancel();
    this.outgoing?.remove();
  }
  componentWillUnmount() {
    this.clear();
  }
  render() {
    return (
      <div
        ref={this.node}
        className="thumb-dock-content"
        data-mode={this.props.mode}
      >
        {this.props.children}
      </div>
    );
  }
}
