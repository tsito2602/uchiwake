// Adapted from tsito2602/kondo (MIT). Crossfade between dock modes.
import { Component, createRef, type ReactNode } from "react";
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Props = { identity: string; mode: string; children: ReactNode };

/** Keep only an inert visual copy of outgoing controls; their handlers expire immediately. */
export class DockContent extends Component<Props> {
  node = createRef<HTMLDivElement>();
  outgoing?: HTMLElement;
  entrance?: Animation;
  exit?: Animation;

  getSnapshotBeforeUpdate(previous: Props) {
    if (previous.identity === this.props.identity || reduceMotion())
      return null;
    const node = this.node.current;
    if (!node?.animate) return null;
    const copy = node.cloneNode(true) as HTMLElement;
    copy.style.opacity = window.getComputedStyle(node).opacity;
    copy.dataset.outgoing = "true";
    copy.inert = true;
    copy.setAttribute("aria-hidden", "true");
    for (const element of [copy, ...copy.querySelectorAll("*")]) {
      for (const attribute of ["id", "name", "form", "href", "autofocus"])
        element.removeAttribute(attribute);
    }
    return copy;
  }

  componentDidUpdate(
    previous: Props,
    _state: unknown,
    copy: HTMLElement | null,
  ) {
    if (previous.identity === this.props.identity) return;
    this.clear();
    const node = this.node.current;
    if (!copy || !node) return;
    this.outgoing = copy;
    node.parentElement!.appendChild(copy);
    this.exit = copy.animate(
      [{ opacity: copy.style.opacity || "1" }, { opacity: 0 }],
      {
        duration: 140,
        easing: "ease-out",
        fill: "forwards",
      },
    );
    void this.exit.finished.then(
      () => copy.remove(),
      () => copy.remove(),
    );
    node.inert = true;
    this.entrance = node.animate([{ opacity: 0 }, { opacity: 1 }], {
      delay: 180,
      duration: 240,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "backwards",
    });
    const entrance = this.entrance;
    void entrance.finished.then(
      () => {
        if (this.entrance === entrance) node.inert = false;
      },
      () => {},
    );
  }

  clear() {
    if (this.node.current) this.node.current.inert = false;
    this.entrance?.cancel();
    this.exit?.cancel();
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

