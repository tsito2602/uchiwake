export function historyIndexAt(clientX:number,left:number,width:number,count:number,scrollLeft=0,visibleMonths=count) {
  if(count<1||width<=0)return null;
  const x=Math.max(0,Math.min(width-.001,clientX-left));
  return Math.max(0,Math.min(count-1,Math.floor((x+scrollLeft)/width*Math.min(count,visibleMonths))));
}

export function historyLabelLeft(index:number,count:number,width:number,labelWidth:number,scrollLeft=0,visibleMonths=count) {
  if(count<1)return 0;
  const center=(index+.5)/Math.min(count,visibleMonths)*width-scrollLeft;
  return Math.max(0,Math.min(width-labelWidth,center-labelWidth/2));
}

// Keep newer months available after tapping an older bar. Move the fetched
// five-year window only when the requested month falls outside it.
export function historyEndMonth(month:string,currentEnd=month) {
  const serial=(value:string)=>Number(value.slice(0,4))*12+Number(value.slice(5))-1;
  const end=Math.max(serial(month),Math.min(serial(currentEnd),serial(month)+59));
  return `${Math.floor(end/12)}-${String(end%12+1).padStart(2,'0')}`;
}

export function historyScrollForIndex(index:number,count:number,width:number,visibleMonths:number,scrollLeft:number) {
  if(count<1||width<=0)return 0;
  const slot=width/Math.min(count,visibleMonths);
  return Math.max(0,Math.min((count-Math.min(count,visibleMonths))*slot,Math.max((index+1)*slot-width,Math.min(index*slot,scrollLeft))));
}

export function historyEdgeVelocity(clientX:number,left:number,width:number) {
  if(width<=0)return 0;
  const edge=Math.min(44,width*.16),x=clientX-left;
  if(x<edge)return -220*Math.min(1,(edge-x)/edge);
  if(x>width-edge)return 220*Math.min(1,(x-width+edge)/edge);
  return 0;
}

// SVG coordinates, with twelve o'clock as the start and clockwise turns.
export function pieIndexAt(x:number,y:number,ends:number[]) {
  const dx=x-100,dy=y-100;
  const radius=Math.hypot(dx,dy);
  if(radius<3||radius>99||!ends.length)return null;
  const turn=((Math.atan2(dy,dx)+Math.PI/2)/(2*Math.PI)+1)%1;
  const index=ends.findIndex(end=>turn<end);
  return index<0?ends.length-1:index;
}

export function pieSlice(start:number,end:number,radius=88) {
  const point=(turn:number)=>`${100+radius*Math.cos(turn*Math.PI*2-Math.PI/2)} ${100+radius*Math.sin(turn*Math.PI*2-Math.PI/2)}`;
  // Two arcs also handle a single category occupying the entire circle.
  return `M 100 100 L ${point(start)} A ${radius} ${radius} 0 0 1 ${point((start+end)/2)} A ${radius} ${radius} 0 0 1 ${point(end)} Z`;
}
