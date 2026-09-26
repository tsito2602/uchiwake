export function historyIndexAt(clientX:number,left:number,width:number,count:number) {
  if(count<1||width<=0)return null;
  return Math.max(0,Math.min(count-1,Math.floor((clientX-left)/width*count)));
}

export function historyLabelLeft(index:number,count:number,width:number,labelWidth:number) {
  if(count<1)return 0;
  const center=(index+.5)/count*width;
  return Math.max(0,Math.min(width-labelWidth,center-labelWidth/2));
}
