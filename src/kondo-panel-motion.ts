// Adapted from tsito2602/kondo's animateDialog (MIT; see licenses/kondo-MIT.txt).
export type PanelOrigin = {left:number;top:number;width:number;height:number};
export const panelTiming:KeyframeAnimationOptions={duration:320,easing:'cubic-bezier(.32, 0, .2, 1)',fill:'both'};

export function animatePanelBackground(main:HTMLElement,blur=true) {
  const bounds=main.getBoundingClientRect();
  const viewport=window.visualViewport;
  const transformOrigin=`${window.innerWidth/2-bounds.left}px ${(viewport?.offsetTop||0)+(viewport?.height||window.innerHeight)/2-bounds.top}px`;
  return main.animate([
    {scale:'1',transformOrigin,...(blur?{filter:'blur(0px)'}:{})},
    {scale:'.94',transformOrigin,...(blur?{filter:'blur(6px)'}:{})},
  ],panelTiming);
}

export function animatePanelSurroundings(panel:HTMLElement,main:HTMLElement|null,parents:HTMLElement[]) {
  // Like kondo's menuDepth, keep the live parent behind the child and recede it
  // by 6% with a 6px blur. Reverse the same timeline when returning to it.
  const parent=parents.at(-1);
  if(parent)return [animatePanelBackground(parent)];
  // Nested panels share the outer scrim and page depth without restarting them.
  const scrim=panel.parentElement?.querySelector<HTMLElement>('.card-panel-scrim');
  const animations=scrim?[scrim.animate([{opacity:0},{opacity:1}],panelTiming)]:[];
  if(main)animations.push(animatePanelBackground(main));
  return animations;
}

export function animatePanel(panel:HTMLElement,source?:PanelOrigin) {
  const bounds=panel.getBoundingClientRect();
  const full={clipPath:`inset(0px 0px 0px 0px round ${window.getComputedStyle(panel).borderRadius||'0px'})`,transform:'translateY(0px)',opacity:1};
  let folded:Keyframe={clipPath:'inset(0px 0px 0px 0px round 22px)',transform:'translateY(48px)',opacity:0};
  if(source&&source.width>100&&source.height>65&&source.top+source.height>bounds.top&&source.top<bounds.bottom&&source.left+source.width>bounds.left&&source.left<bounds.right){
    const top=Math.max(0,source.top-bounds.top);
    const right=Math.max(0,bounds.right-source.left-source.width);
    const bottom=Math.max(0,bounds.bottom-source.top-source.height);
    const left=Math.max(0,source.left-bounds.left);
    folded={clipPath:`inset(${top}px ${right}px ${bottom}px ${left}px round 16px)`,transform:'translateY(0px)',opacity:0};
  }
  // The open panel must return to its normal, unclipped scroll surface. Keeping
  // a forwards-filled clip/transform here can leave WebKit's scroll tiles blank.
  // Retain the timeline for dismissal, but not its final compositing effect.
  return panel.animate([folded,full],{...panelTiming,fill:'backwards'});
}

export function reversePanel(animation:Animation,companions:Animation[]) {
  const time=animation.currentTime;
  // Hold the folded frame until React unmounts the panel. Without this, a reverse
  // animation with backwards-only fill would briefly reveal the open panel.
  animation.effect?.updateTiming({fill:'both'});
  animation.playbackRate=-1.15;
  animation.play();
  for(const companion of companions){
    companion.currentTime=time;
    companion.playbackRate=-1.15;
    companion.play();
  }
}
