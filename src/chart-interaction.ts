export function historyIndexAt(clientX:number,left:number,width:number,count:number) {
  if(count<1||width<=0)return null;
  return Math.max(0,Math.min(count-1,Math.floor((clientX-left)/width*count)));
}

export function historyLabelLeft(index:number,count:number,width:number,labelWidth:number) {
  if(count<1)return 0;
  const center=(index+.5)/count*width;
  return Math.max(0,Math.min(width-labelWidth,center-labelWidth/2));
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
