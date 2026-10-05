// Adapted from tsito2602/kondo's animateDialog (MIT; see licenses/kondo-MIT.txt).
export type PanelOrigin = {left:number;top:number;width:number;height:number;round?:boolean};
export const panelTiming:KeyframeAnimationOptions={duration:320,easing:'cubic-bezier(.32, 0, .2, 1)',fill:'both'};
// The card itself becomes the panel: its outline stretches to full size on a
// stiff spring that overshoots a touch, then settles (Cartoon Physics boing).
const linearEasing=typeof CSS!=='undefined'&&typeof CSS.supports==='function'&&CSS.supports('animation-timing-function','linear(0, 1)');
// Sampled here (not imported) so node's type-stripping tests load this file as is.
function springCurve(stiffness:number,damping:number){
  const points=[0];let x=0,v=0;
  for(let i=0;i<240&&!(i>20&&Math.abs(x-1)<.001&&Math.abs(v)<.01);i++){v+=(-stiffness*(x-1)-damping*v)/120;x+=v/120;points.push(x);}
  points[points.length-1]=1;
  const stride=Math.max(1,Math.floor(points.length/48));
  return {easing:`linear(${points.filter((_,i)=>i%stride===0||i===points.length-1).map(p=>+p.toFixed(4)).join(',')})`,duration:Math.round((points.length-1)/120*1000)};
}
export const morphTiming:KeyframeAnimationOptions={duration:320,easing:linearEasing?springCurve(380,23).easing:'cubic-bezier(.3, 1.18, .42, 1)',fill:'both'};
// The mock's card → panel: the card's own box grows into the panel on a
// k300/c23 spring (about 6% past, then back), and returns on k420/c30.
const growSpring=springCurve(300,23),foldSpring=springCurve(420,30);
export const growTiming:KeyframeAnimationOptions={duration:growSpring.duration,easing:linearEasing?growSpring.easing:'cubic-bezier(.3, 1.25, .42, 1)',fill:'both'};
export const foldTiming:KeyframeAnimationOptions={duration:foldSpring.duration,easing:linearEasing?foldSpring.easing:'cubic-bezier(.3, 1.1, .42, 1)',fill:'both'};
const CARD_RADIUS=20;
type Morph={frame:HTMLElement;folded:Keyframe;glass?:HTMLElement;foldedGlass?:string;openGlass?:string;content?:HTMLElement;rows:HTMLElement[]};
const morphs=new WeakMap<Animation,Morph>();
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

function growSource(bounds:{left:number;top:number;right:number;bottom:number;width:number;height:number},source?:PanelOrigin):PanelOrigin|null {
  if(!bounds.width||!bounds.height)return null;
  const rest={left:bounds.left+12,top:bounds.bottom-96,width:Math.max(1,bounds.width-24),height:84};
  if(!source||source.width<1||source.height<1)return rest;
  const reach=typeof window!=='undefined'&&window.innerHeight?window.innerHeight:bounds.bottom;
  if(source.top+source.height<0||source.top>reach)return rest;
  return source;
}

export function animatePanel(panel:HTMLElement,source?:PanelOrigin) {
  const bounds=panel.getBoundingClientRect();
  const glass=panel.querySelector<HTMLElement>(':scope > .card-panel-glass');
  const content=panel.querySelector<HTMLElement>(':scope > .card-panel');
  const radius=window.getComputedStyle(panel).borderRadius||'0px';
  const parts:Animation[]=[];
  // Every panel opens the same way: whatever was tapped (a card, a row, a
  // button) grows into it. With nothing to grow from, or a source scrolled out
  // of reach, it grows from a card-sized box resting on the dock.
  const from=growSource(bounds,source);
  if(from){
    source=from;
    // The card itself grows: its box is mapped onto the panel's and springs open.
    const sx=source.width/bounds.width,sy=source.height/bounds.height;
    const dx=source.left-bounds.left,dy=source.top-bounds.top;
    const folded:Keyframe={transformOrigin:'0px 0px',transform:`translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`};
    const full:Keyframe={transformOrigin:'0px 0px',transform:'translate(0px, 0px) scale(1, 1)'};
    // Undo the squash on the corners so they stay the card's while it grows.
    const corner=source.round?Math.min(source.width,source.height)/2:Math.min(CARD_RADIUS,source.width/2,source.height/2);
    const foldedGlass=`inset(0px 0px 0px 0px round ${(corner/sx).toFixed(2)}px / ${(corner/sy).toFixed(2)}px)`;
    const openGlass=`inset(0px 0px 0px 0px round ${radius})`;
    if(glass)parts.push(glass.animate([{clipPath:foldedGlass},{clipPath:openGlass}],{...growTiming,fill:'backwards'}));
    // Text waits until the box is mostly open, then each row rises 10px in turn.
    const rows=content?[...content.querySelectorAll<HTMLElement>('.card-panel-header, .card-panel-scroll > *')].slice(0,8):[];
    if(content)parts.push(content.animate([{opacity:0,clipPath:foldedGlass},{opacity:0,offset:.22},{opacity:1,clipPath:openGlass}],{duration:growTiming.duration,easing:'linear',fill:'backwards'}));
    rows.forEach((row,index)=>parts.push(row.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0px)'}],{duration:220,delay:Number(growTiming.duration)*.3+index*40,easing:'cubic-bezier(.22, 1, .36, 1)',fill:'backwards'})));
    const animation=panel.animate([folded,full],{...growTiming,fill:'backwards'});
    panelParts.set(animation,parts);
    morphs.set(animation,{frame:panel,folded,glass:glass??undefined,foldedGlass,openGlass,content:content??undefined,rows});
    void animation.finished.then(()=>{
      if(animation.playbackRate<=0||animation.playState!=='finished'||morphs.get(animation)?.frame.dataset.folding)return;
      animation.cancel();parts.forEach(part=>part.cancel());
    },()=>undefined);
    return animation;
  }
  const full:Keyframe={transform:'translateY(0px)'};
  const folded:Keyframe={transform:'translateY(48px)'};
  const foldedGlass=`inset(100% 0px 0px 0px round ${radius})`;
  // Never fade the glass's ancestor. Opacity below 1 creates a backdrop root,
  // cutting off the page from its blur until the entrance ends (a second step).
  // Reveal the constant-tint glass spatially and fade only its content sibling.
  if(glass)parts.push(glass.animate([
    {clipPath:foldedGlass},
    {clipPath:`inset(0px 0px 0px 0px round ${radius})`},
  ],{...morphTiming,fill:'backwards'}));
  if(content)parts.push(content.animate([
    {opacity:0,clipPath:foldedGlass},
    {opacity:1,clipPath:`inset(0px 0px 0px 0px round ${radius})`},
  ],{...morphTiming,fill:'backwards'}));
  const animation=panel.animate([folded,full],{...morphTiming,fill:'backwards'});
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
  const morph=morphs.get(animation);
  if(morph){
    // Fold back into the card on a firmer spring, starting from wherever the
    // box is now (a dismissal while it is still growing included).
    const {frame,folded,glass,foldedGlass,openGlass,content,rows}=morph;
    frame.dataset.folding='true';
    const style=window.getComputedStyle(frame),now:Keyframe={transformOrigin:'0px 0px',transform:style.transform==='none'?'translate(0px, 0px) scale(1, 1)':style.transform};
    const glassNow=glass?window.getComputedStyle(glass).clipPath:'';
    panelParts.get(animation)?.forEach(part=>part.cancel());rows.forEach(row=>row.getAnimations?.().forEach(a=>a.cancel()));
    animation.effect&&(animation.effect as KeyframeEffect).setKeyframes([now,folded]);
    animation.effect?.updateTiming({duration:Number(foldTiming.duration),easing:String(foldTiming.easing),fill:'both',delay:0});
    animation.currentTime=0;animation.playbackRate=1;animation.play();
    const parts:Animation[]=[];
    if(glass)parts.push(glass.animate([{clipPath:glassNow&&glassNow!=='none'?glassNow:openGlass},{clipPath:foldedGlass}],foldTiming));
    if(content)parts.push(content.animate([{opacity:1},{opacity:0,offset:.35},{opacity:0}],{duration:foldTiming.duration,easing:'linear',fill:'both'}));
    // The box melts into whatever it came from as it lands instead of stopping
    // on top of it: the glass itself (never its ancestor, which would cut its
    // blur) fades over the last stretch of the fold.
    if(glass)parts.push(glass.animate([{opacity:1},{opacity:1,offset:.3},{opacity:0,offset:.62},{opacity:0}],{duration:foldTiming.duration,easing:'linear',fill:'both'}));
    panelParts.set(animation,parts);
    const duration=Number(foldTiming.duration);
    for(const companion of companions){
      companion.effect?.updateTiming({fill:'both'});
      const end=Number(companion.effect?.getComputedTiming().endTime)||320;
      const time=companion.currentTime==null?end:Math.min(end,Number(companion.currentTime));
      companion.currentTime=time;
      companion.playbackRate=-Math.max(.6,time/duration);
      companion.play();
    }
    return;
  }
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
