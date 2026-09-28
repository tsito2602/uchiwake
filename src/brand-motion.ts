// Approved uchiwake launch: clockwise donut fill and continuous single-roll motion.
export type Point=number[];
export const BRAND_THEMES={light:{background:"#ffffff",ink:"#000000",mid:"#9c978f",pale:"#cbc5bb"},dark:{background:"#000000",ink:"#f5f1e9",mid:"#b6b0a6",pale:"#817b72"}} as const;
// Share the installed icon's first-stroke placement across every brand surface.
export const FIRST_STROKE_OFFSET_Y=-28;
export type BrandTheme=keyof typeof BRAND_THEMES;
// Compress the entire approved sequence uniformly, preserving its easing and path.
export const BOOT_TIME_SCALE=0.8;
export const NAME_DELAY=1720;
export const NAME_STAGGER=48;
export const NAME_DURATION=256;
export const BOOT_HOLD_END=NAME_DELAY+7*NAME_STAGGER+NAME_DURATION;
export const BOOT_EXIT_DURATION=192;
 export const pathData=[
  'M 451 250 Q 647 160 838 282 Q 856 294 848 311 L 819 369 Q 811 385 796 377 Q 642 293 482 354 Q 469 359 462 344 L 441 287 Q 434 262 451 250 Z',
  'M 320 517 Q 531 293 796 415 L 693 567 Q 541 488 381 611 C 324 644 273 580 312 530 Z',
  'M 817 430 C 944 504 997 657 929 808 L 742 702 Q 764 635 712 584 Z',
  'M 732 727 L 922 835 Q 849 980 654 1024 L 605 821 Q 689 792 732 727 Z',
  'M 628 1027 Q 457 1032 363 904 C 326 854 367 777 417 802 Q 489 836 581 827 Z'
 ];
 const clamp=(v:number)=>Math.max(0,Math.min(1,v));
 function bezier(x1:number,y1:number,x2:number,y2:number){
  const axis=(s:number,a:number,b:number)=>3*(1-s)*(1-s)*s*a+3*(1-s)*s*s*b+s*s*s;
  return (value:number)=>{const x=clamp(value);if(x===0||x===1)return x;let lo=0,hi=1;for(let i=0;i<20;i++){const m=(lo+hi)/2;if(axis(m,x1,x2)<x)lo=m;else hi=m}return axis((lo+hi)/2,y1,y2)};
 }
 const fillEase=bezier(.65,0,.35,1);
 // Sample the approved logo contours so the same physical slice can rotate
 // out of a true circular annulus and settle into the exact final letterform.
 function flatten(d:string):Point[]{
  const tokens=d.match(/[A-Z]|-?\d+(?:\.\d+)?/g)!;let j=0;let p:Point=[0,0],first:Point=[0,0];const out:Point[]=[];
  const point=()=>[Number(tokens[j++]),Number(tokens[j++])];
  while(j<tokens.length){
   const cmd=tokens[j++];
   if(cmd==='M'){p=point();first=p;out.push(p);continue}
   if(cmd==='Z'){out.push(first);continue}
   const from=p;
   if(cmd==='L'){p=point();out.push(p);continue}
   const c1=point(),c2=cmd==='C'?point():[0,0],end=point();
   for(let k=1;k<=32;k++){const t=k/32,u=1-t;out.push([0,1].map(axis=>cmd==='Q'?u*u*from[axis]+2*u*t*c1[axis]+t*t*end[axis]:u*u*u*from[axis]+3*u*u*t*c1[axis]+3*u*t*t*c2[axis]+t*t*t*end[axis]))}
   p=end;
  }
  return out;
 }
 function resample(points:Point[],n=48):Point[]{
  const p=points,lens=[0];
  for(let i=1;i<p.length;i++)lens.push(lens[i-1]+Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]));
  let seg=1;return Array.from({length:n},(_,i)=>{const v=i*lens[lens.length-1]/n;while(seg<lens.length-1&&lens[seg]<v)seg++;const t=(v-lens[seg-1])/(lens[seg]-lens[seg-1]||1);return [0,1].map(a=>p[seg-1][a]+(p[seg][a]-p[seg-1][a])*t)});
 }
 // Corresponding corners stay paired throughout the morph: outer arc,
 // end edge, inner arc, start edge. In particular, the gray pieces cannot
 // slide around their own perimeter, which previously looked like rotation.
 const edges=[
  ['M451 250 Q647 160 838 282 Q856 294 848 311','M848 311 L819 369 Q811 385 796 377','M796 377 Q642 293 482 354 Q469 359 462 344','M462 344 L441 287 Q434 262 451 250'],
  ['M320 517 Q531 293 796 415','M796 415 L693 567','M693 567 Q541 488 381 611','M381 611 C324 644 273 580 312 530 L320 517'],
  ['M817 430 C944 504 997 657 929 808','M929 808 L742 702','M742 702 Q764 635 712 584','M712 584 L817 430'],
  ['M922 835 Q849 980 654 1024','M654 1024 L605 821','M605 821 Q689 792 732 727','M732 727 L922 835'],
  ['M628 1027 Q457 1032 363 904','M363 904 C326 854 367 777 417 802','M417 802 Q489 836 581 827','M581 827 L628 1027']
 ];
 const targets=edges.map((sides,i)=>sides.flatMap(d=>resample(flatten(d))).map(([x,y])=>[x,y+(i===0?FIRST_STROKE_OFFSET_Y:0)]));
 const spans=[[145,215],[215,302],[302,385],[385,445],[445,505]];
 const gapWidth=26;
 const rings=spans.map(([a,b])=>{
  a=a*Math.PI/180;b=b*Math.PI/180;
  // Offset each cut by half the finished gap, perpendicular to its radial
  // axis. Separate angular offsets keep the gap 26 units at both radii.
  const outerPad=Math.asin(gapWidth/2/325),innerPad=Math.asin(gapWidth/2/165);
  const polar=(r:number,t:number):Point=>[627+r*Math.cos(t),666+r*Math.sin(t)];
  const outer=Array.from({length:81},(_,k)=>polar(325,a+outerPad+(b-a-2*outerPad)*k/80));
  const inner=Array.from({length:81},(_,k)=>polar(165,b-innerPad-(b-a-2*innerPad)*k/80));
  return [outer,[outer[80],inner[0]],inner,[inner[80],outer[0]]].flatMap(side=>resample(side));
 });
 function centroid(points:Point[]):Point{
  let area=0,x=0,y=0;points.forEach((p,i)=>{const q=points[(i+1)%points.length],cross=p[0]*q[1]-q[0]*p[1];area+=cross;x+=(p[0]+q[0])*cross;y+=(p[1]+q[1])*cross});return [x/(3*area),y/(3*area)];
 }
 const fromCenter=centroid(rings[0]),toCenter=centroid(targets[0]);
 const flowEase=bezier(.45,0,.22,1);
 export function geometry(t:number){
  const spec={travel:1150,turns:1.25,bulge:390},p=flowEase((t-1100)/spec.travel);
  const shape=p;
  const body=rings.slice(1).map((ring,i)=>ring.map((p,k)=>p.map((v,a)=>v+(targets[i+1][k][a]-v)*shape)));
  // One uninterrupted curve and one shared easing value. Translation and
  // rotation start together and finish together, with no phase boundaries.
  const r0=627-fromCenter[0],r1=666-toCenter[1];
  const radius=r0+(r1-r0)*p+spec.bulge*Math.sin(Math.PI*p);
  const angle=Math.PI+p*Math.PI/2;
  const center=[627+radius*Math.cos(angle)+(toCenter[0]-627)*p,666+radius*Math.sin(angle)];
  const theta=p*spec.turns*2*Math.PI,cs=Math.cos(theta),sn=Math.sin(theta);
  const contour=p*p*p;
  // Restore the approved first stroke. Morph corresponding edges in local
  // coordinates, preserving the selected continuous motion and rotation.
  const head=rings[0].map((point,k)=>{
   const x0=point[0]-fromCenter[0],y0=point[1]-fromCenter[1];
   const tx=targets[0][k][0]-toCenter[0],ty=targets[0][k][1]-toCenter[1];
   const x=x0+(ty-x0)*contour,y=y0+(-tx-y0)*contour;
   return [center[0]+x*cs-y*sn,center[1]+x*sn+y*cs];
  });
  return {body,head};
 }

export function drawBrand(ctx: CanvasRenderingContext2D, width: number, height: number, t: number, theme: BrandTheme) {
  t /= BOOT_TIME_SCALE;
  const palette = BRAND_THEMES[theme];
  const colors = [palette.ink, palette.ink, palette.mid, palette.pale, palette.ink];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.scale(width / 1750, height / 1385);
  ctx.translate(248, 240);
  const polygon = (points: Point[], color: string) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  if (t <= 1100) {
    const fill = fillEase((t - 100) / 900);
    if (fill > 0) {
      if (fill < 1) {
        const start = 215 * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(627, 666);
        ctx.arc(627, 666, 600, start, start + fill * 2 * Math.PI);
        ctx.closePath();
        ctx.clip();
      }
      rings.forEach((ring, i) => polygon(ring, colors[i]));
    }
  } else {
    const { body, head } = geometry(t);
    body.forEach((part, i) => polygon(part, colors[i + 1]));
    polygon(head, palette.ink);
  }
  ctx.restore();
}
