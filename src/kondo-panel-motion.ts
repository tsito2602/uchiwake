// Adapted from tsito2602/kondo's animateDialog (MIT; see licenses/kondo-MIT.txt).
export type PanelOrigin = {left:number;top:number;width:number;height:number};
export const panelTiming:KeyframeAnimationOptions={duration:320,easing:'cubic-bezier(.32, 0, .2, 1)',fill:'both'};

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
  return panel.animate([folded,full],panelTiming);
}

export function reversePanel(animation:Animation,companions:Animation[]) {
  const time=animation.currentTime;
  animation.playbackRate=-1.15;
  animation.play();
  for(const companion of companions){
    companion.currentTime=time;
    companion.playbackRate=-1.15;
    companion.play();
  }
}
