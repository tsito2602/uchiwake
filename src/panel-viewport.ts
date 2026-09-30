import { revealPanelField } from './panel-focus';

// Like uchino, size the panel against the layout viewport. The visual viewport
// only controls the space needed to scroll a field above the keyboard and dock.
export function trackPanelViewport(panel:HTMLElement,shell:HTMLElement) {
  const view=panel.ownerDocument.defaultView!;
  const viewport=view.visualViewport;
  let frame=0,revealFrame=0;
  const reveal=()=>{
    view.cancelAnimationFrame(revealFrame);
    revealFrame=view.requestAnimationFrame(()=>{
      if(!viewport||Math.abs(viewport.scale-1)<.01){
        const focused=panel.ownerDocument.activeElement;
        if(panel.contains(focused))revealPanelField(focused);
      }
    });
  };
  const update=()=>{
    if(viewport&&Math.abs(viewport.scale-1)>=.01)return;
    const height=view.innerHeight;
    const covered=Math.max(0,height-(viewport?.height??height));
    shell.style.setProperty('--panel-viewport-height',`${height}px`);
    shell.style.setProperty('--panel-keyboard-inset',`${covered>=120?covered:0}px`);
    reveal();
  };
  const schedule=()=>{view.cancelAnimationFrame(frame);frame=view.requestAnimationFrame(update);};
  update();
  viewport?.addEventListener('resize',schedule);
  viewport?.addEventListener('scroll',reveal);
  view.addEventListener('resize',schedule);
  panel.addEventListener('focusin',reveal);
  return()=>{
    view.cancelAnimationFrame(frame);view.cancelAnimationFrame(revealFrame);
    viewport?.removeEventListener('resize',schedule);
    viewport?.removeEventListener('scroll',reveal);
    view.removeEventListener('resize',schedule);
    panel.removeEventListener('focusin',reveal);
    shell.style.removeProperty('--panel-viewport-height');
    shell.style.removeProperty('--panel-keyboard-inset');
  };
}
