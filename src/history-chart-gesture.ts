import { historyEdgeVelocity, historyIndexAt } from './chart-interaction';

type Pointer={pointerId:number;clientX:number;clientY:number;timeStamp:number};
type Viewport={left:number;width:number;count:number;visibleMonths:number;scrollLeft:number};
type Options={
  viewport:()=>Viewport;
  scrollTo:(left:number)=>void;
  onPreview:(index:number|null)=>void;
  onSelect:(index:number)=>void;
  requestFrame?:(callback:(time:number)=>void)=>number;
  cancelFrame?:(id:number)=>void;
};

// Pointer capture belongs to the element; gesture state and the frame loop share
// one lifetime so a cancelled drag can never turn into a month selection.
export function createHistoryGesture(options:Options) {
  const requestFrame=options.requestFrame??(callback=>requestAnimationFrame(callback));
  const cancelFrame=options.cancelFrame??(id=>cancelAnimationFrame(id));
  let press:(Pointer&{startX:number;startY:number;startedAt:number;index:number|null;moved:boolean})|null=null;
  let frame:number|null=null,lastFrame:number|null=null;
  const indexAt=(x:number)=>{const v=options.viewport();return historyIndexAt(x,v.left,v.width,v.count,v.scrollLeft,v.visibleMonths);};
  function stopFrame() {if(frame!==null)cancelFrame(frame);frame=null;lastFrame=null;}
  function velocity() {
    if(!press?.moved)return 0;
    const v=options.viewport();
    const speed=historyEdgeVelocity(press.clientX,v.left,v.width);
    const maximum=v.width*Math.max(0,v.count/Math.min(v.count||1,v.visibleMonths)-1);
    return (speed<0&&v.scrollLeft>0)||(speed>0&&v.scrollLeft<maximum-.5)?speed:0;
  }
  function tick(time:number) {
    frame=null;
    if(!press)return;
    const speed=velocity();
    if(!speed){lastFrame=null;return;}
    const v=options.viewport();
    const elapsed=lastFrame===null?0:Math.min(32,Math.max(0,time-lastFrame));
    lastFrame=time;
    const maximum=v.width*Math.max(0,v.count/Math.min(v.count||1,v.visibleMonths)-1);
    options.scrollTo(Math.max(0,Math.min(maximum,v.scrollLeft+speed*elapsed/1000)));
    options.onPreview(indexAt(press.clientX));
    if(velocity())frame=requestFrame(tick);else lastFrame=null;
  }
  function refresh() {
    if(!press)return;
    options.onPreview(indexAt(press.clientX));
    if(velocity()){if(frame===null)frame=requestFrame(tick);}else stopFrame();
  }
  function cancel(pointerId?:number) {
    if(pointerId!==undefined&&press?.pointerId!==pointerId)return;
    press=null;stopFrame();options.onPreview(null);
  }
  return {
    start(event:Pointer) {
      if(press)return false;
      const index=indexAt(event.clientX);
      if(index===null)return false;
      press={pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,timeStamp:event.timeStamp,startX:event.clientX,startY:event.clientY,startedAt:event.timeStamp,index,moved:false};
      refresh();return true;
    },
    move(event:Pointer) {
      if(press?.pointerId!==event.pointerId)return;
      press.clientX=event.clientX;press.clientY=event.clientY;
      if(Math.hypot(event.clientX-press.startX,event.clientY-press.startY)>10)press.moved=true;
      refresh();
    },
    end(event:Pointer) {
      if(press?.pointerId!==event.pointerId)return;
      const v=options.viewport(),index=indexAt(event.clientX);
      const tap=!press.moved&&Math.hypot(event.clientX-press.startX,event.clientY-press.startY)<=10&&
        event.timeStamp-press.startedAt<350&&event.clientX>=v.left&&event.clientX<=v.left+v.width&&index===press.index;
      cancel();
      if(tap&&index!==null)options.onSelect(index);
    },
    refresh,
    cancel
  };
}
