type Bounds={left:number;right:number;top:number;bottom:number};

// Outside the tab island means no preview, never an off-screen fourth position.
export function dockTabAt(x:number,y:number,buttons:Bounds[]):number|null {
  const index=buttons.findIndex(rect=>x>=rect.left&&x<rect.right&&y>=rect.top&&y<=rect.bottom);
  return index<0?null:index;
}
