const minimumDuration = 300;
export const spaceSwitchFadeDuration = 180;

// Only call after the destination has committed its data or error state.
export function finishSpaceSwitch(root:HTMLElement|null,started:number,onFade:()=>void,onExited:()=>void) {
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let disposed=false,fading=false,frame=0,timer=0,fallback=0;
  const cancel=()=>{
    disposed=true;
    window.clearTimeout(timer);window.clearTimeout(fallback);window.cancelAnimationFrame(frame);
  };
  const fade=()=>{
    if(disposed||fading)return;
    fading=true;
    window.clearTimeout(fallback);window.cancelAnimationFrame(frame);
    onFade();
    timer=window.setTimeout(()=>{if(!disposed){cancel();onExited();}},reduced?0:spaceSwitchFadeDuration);
  };
  timer=window.setTimeout(()=>{
    // Repaint under the opaque cover without transforming the live page or
    // changing the containing blocks of its fixed dock and floating panels.
    if(root){
      const visibility=root.style.visibility;
      root.style.visibility='hidden';root.getBoundingClientRect();
      window.scrollTo({top:0,left:0,behavior:'instant'});
      root.style.visibility=visibility;
    }
    frame=window.requestAnimationFrame(()=>{frame=window.requestAnimationFrame(fade);});
    // Background tabs can suspend animation frames; ready content must unlock.
    fallback=window.setTimeout(fade,250);
  },Math.max(0,(reduced?0:minimumDuration)-(performance.now()-started)));
  return cancel;
}
