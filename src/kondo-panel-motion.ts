// Adapted from tsito2602/kondo's animateDialog (MIT; see licenses/kondo-MIT.txt).
export type PanelOrigin = {left:number;top:number;width:number;height:number};
export const panelTiming:KeyframeAnimationOptions={duration:320,easing:'cubic-bezier(.32, 0, .2, 1)',fill:'both'};
const completedEntrances=new WeakMap<Animation,CSSNumberish>();
const panelParts=new WeakMap<Animation,Animation[]>();

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
  if(parent){
    const content=parent.querySelector<HTMLElement>(':scope > .card-panel');
    // Keep the parent's glass connected to the page too: filter on its frame
    // would create the same backdrop-root jump when returning from a child.
    return [animatePanelBackground(parent,false),...(content?[
      content.animate([{filter:'blur(0px)'},{filter:'blur(6px)'}],panelTiming),
    ]:[])];
  }
  // Nested panels share the outer scrim and page depth without restarting them.
  const scrim=panel.parentElement?.querySelector<HTMLElement>('.card-panel-scrim');
  const animations=scrim?[scrim.animate([{opacity:0},{opacity:1}],panelTiming)]:[];
  if(main)animations.push(animatePanelBackground(main));
  return animations;
}

export function animatePanel(panel:HTMLElement,source?:PanelOrigin) {
  const bounds=panel.getBoundingClientRect();
  const full:Keyframe={transform:'translateY(0px)'};
  let folded:Keyframe={transform:'translateY(48px)'};
  const glass=panel.querySelector<HTMLElement>(':scope > .card-panel-glass');
  const content=panel.querySelector<HTMLElement>(':scope > .card-panel');
  const radius=window.getComputedStyle(panel).borderRadius||'0px';
  const parts:Animation[]=[];
  let foldedGlass=`inset(100% 0px 0px 0px round ${radius})`;
  if(glass&&source&&source.width>100&&source.height>65&&source.top+source.height>bounds.top&&source.top<bounds.bottom&&source.left+source.width>bounds.left&&source.left<bounds.right){
    const top=Math.max(0,source.top-bounds.top);
    const right=Math.max(0,bounds.right-source.left-source.width);
    const bottom=Math.max(0,bounds.bottom-source.top-source.height);
    const left=Math.max(0,source.left-bounds.left);
    foldedGlass=`inset(${top}px ${right}px ${bottom}px ${left}px round 16px)`;
    folded={transform:'translateY(0px)'};
  }
  // Never fade the glass's ancestor. Opacity below 1 creates a backdrop root,
  // cutting off the page from its blur until the entrance ends (a second step).
  // Reveal the constant-tint glass spatially and fade only its content sibling.
  if(glass)parts.push(glass.animate([
    {clipPath:foldedGlass},
    {clipPath:`inset(0px 0px 0px 0px round ${radius})`},
  ],{...panelTiming,fill:'backwards'}));
  if(content)parts.push(content.animate([{opacity:0},{opacity:1}],{...panelTiming,fill:'backwards'}));
  const animation=panel.animate([folded,full],{...panelTiming,fill:'backwards'});
  panelParts.set(animation,parts);
  // Backwards fill alone still retains a finished animation/compositing layer.
  // Detach it entirely while reading/scrolling, preserving only the exit time.
  // A dismissal during the entrance keeps its live timeline and reverses it.
  void animation.finished.then(()=>{
    if(animation.playbackRate<=0||animation.playState!=='finished')return;
    completedEntrances.set(animation,animation.currentTime??320);
    animation.cancel();
    parts.forEach(part=>part.cancel());
  },()=>undefined);
  return animation;
}

export function cancelPanel(animation:Animation) {
  animation.cancel();
  panelParts.get(animation)?.forEach(part=>part.cancel());
  panelParts.delete(animation);
  completedEntrances.delete(animation);
}

export function reversePanel(animation:Animation,companions:Animation[]) {
  const completedTime=completedEntrances.get(animation);
  const time=completedTime??animation.currentTime;
  completedEntrances.delete(animation);
  // Hold the folded frame until React unmounts the panel. Without this, a reverse
  // animation with backwards-only fill would briefly reveal the open panel.
  animation.effect?.updateTiming({fill:'both'});
  if(completedTime!==undefined)animation.currentTime=completedTime;
  animation.playbackRate=-1.15;
  animation.play();
  for(const companion of [...(panelParts.get(animation)||[]),...companions]){
    companion.effect?.updateTiming({fill:'both'});
    companion.currentTime=time;
    companion.playbackRate=-1.15;
    companion.play();
  }
}
