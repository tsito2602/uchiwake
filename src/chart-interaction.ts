export function historyIndexAt(clientX:number,left:number,width:number,count:number,scrollLeft=0,visibleMonths=count) {
  if(count<1||width<=0)return null;
  const x=Math.max(0,Math.min(width-.001,clientX-left));
  return Math.max(0,Math.min(count-1,Math.floor((x+scrollLeft)/width*Math.min(count,visibleMonths)+1e-9)));
}

export function historyLabelLeft(index:number,count:number,width:number,labelWidth:number,scrollLeft=0,visibleMonths=count) {
  if(count<1)return 0;
  const center=(index+.5)/Math.min(count,visibleMonths)*width-scrollLeft;
  return Math.max(0,Math.min(width-labelWidth,center-labelWidth/2));
}

// Reserve five years to the right of the initial month as well as past history.
// Tapping within this window must not move the timeline beneath the finger.
export function historyEndMonth(month:string,currentEnd?:string) {
  const serial=(value:string)=>Number(value.slice(0,4))*12+Number(value.slice(5))-1;
  const selected=serial(month),previous=currentEnd?serial(currentEnd):selected+60;
  const end=selected>previous||selected<previous-119?selected+60:previous;
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

// A ring piece cut like the logo: straight, parallel cuts that leave the same
// gap at both radii, and square corners. Turns run clockwise from noon.
export function donutSlice(start:number,end:number,outer=88,inner=45,gap=5) {
  const at=(r:number,angle:number)=>`${(100+r*Math.cos(angle)).toFixed(3)} ${(100+r*Math.sin(angle)).toFixed(3)}`;
  if(end-start>=.9999){
    // One category: the whole ring, drawn as two arcs each way.
    return `M ${at(outer,-Math.PI/2)} A ${outer} ${outer} 0 1 1 ${at(outer,Math.PI/2)} A ${outer} ${outer} 0 1 1 ${at(outer,-Math.PI/2)} Z M ${at(inner,-Math.PI/2)} A ${inner} ${inner} 0 1 0 ${at(inner,Math.PI/2)} A ${inner} ${inner} 0 1 0 ${at(inner,-Math.PI/2)} Z`;
  }
  const a=start*Math.PI*2-Math.PI/2,b=end*Math.PI*2-Math.PI/2;
  const outerPad=Math.asin(Math.min(1,gap/2/outer)),innerPad=Math.asin(Math.min(1,gap/2/inner));
  const span=b-a;
  // A sliver thinner than the gap keeps a hairline instead of vanishing.
  const oa=Math.min(a+outerPad,a+span/2-.0005),ob=Math.max(b-outerPad,a+span/2+.0005);
  const ia=Math.min(a+innerPad,a+span/2-.0005),ib=Math.max(b-innerPad,a+span/2+.0005);
  const large=(from:number,to:number)=>to-from>Math.PI?1:0;
  return `M ${at(outer,oa)} A ${outer} ${outer} 0 ${large(oa,ob)} 1 ${at(outer,ob)} L ${at(inner,ib)} A ${inner} ${inner} 0 ${large(ia,ib)} 0 ${at(inner,ia)} Z`;
}
