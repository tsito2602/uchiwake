// uchiwake launch: a cartoon spring. A dot gathers itself, the pie chart fills
// clockwise in one brush-like rush and wobbles like jelly, then the first slice
// crouches, pops out and lands as the first stroke of う.
export type Point=number[];
export const BRAND_THEMES={light:{background:"#ffffff",ink:"#000000",mid:"#9c978f",pale:"#cbc5bb"},dark:{background:"#000000",ink:"#f5f1e9",mid:"#b6b0a6",pale:"#817b72"}} as const;
// Share the installed icon's first-stroke placement across every brand surface.
export const FIRST_STROKE_OFFSET_Y=-28;
export type BrandTheme=keyof typeof BRAND_THEMES;
export const NAME_DELAY=1250;
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

// Launch timeline, in ms.
const DOT=[0,200],FILL=[150,620],JELLY=620,CROUCH=[720,860],AIR=[860,1340],LAND=1340;
const whoosh=bezier(.75,0,.15,1),backOut=bezier(.3,1.6,.5,1),settle=bezier(.22,.72,.18,1);
const seg=(t:number,a:number,b:number)=>clamp((t-a)/(b-a));
// Damped spring, 0 at rest: the cartoon wobble after an impact.
const wobble=(ms:number,freq:number,decay:number)=>ms<=0?0:Math.sin(ms/1000*freq*2*Math.PI)*Math.exp(-ms/decay);
const CENTER:Point=[627,666],R_IN=165,R_OUT=325,R_MID=245;
const rad=(d:number)=>d*Math.PI/180;
const polar=(deg:number,r:number):Point=>[CENTER[0]+Math.cos(rad(deg))*r,CENTER[1]+Math.sin(rad(deg))*r];
const mean=(points:Point[]):Point=>{let x=0,y=0;points.forEach(p=>{x+=p[0];y+=p[1]});return [x/points.length,y/points.length]};
// The approved roll from pie to letter, driven by 0..1.
const roll=(p:number)=>geometry(1100+1150*clamp(p));
const headAt=(p:number)=>mean(roll(p).head);

type Draw={ctx:CanvasRenderingContext2D;ink:string};
function shape({ctx}:Draw,points:Point[],color:string,sx=1,sy=1,dy=0){
  const [cx,cy]=mean(points);
  ctx.beginPath();
  points.forEach(([x,y],i)=>{const px=cx+(x-cx)*sx,py=cy+dy+(y-cy)*sy;i?ctx.lineTo(px,py):ctx.moveTo(px,py)});
  ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
function lines({ctx,ink}:Draw,from:Point,to:Point[],width:number,alpha:number){
  ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=ink;ctx.lineCap='round';ctx.lineWidth=width;
  to.forEach(([x,y],i)=>{ctx.beginPath();ctx.moveTo(i%2?from[0]:x,i%2?from[1]:y);ctx.lineTo(x,y);ctx.stroke()});
  ctx.restore();
}
// A pop of short radial lines around a point.
function burst(d:Draw,[x,y]:Point,p:number,count:number,r0:number,r1:number,from=0,to=360){
  if(p<=0||p>=1)return;
  const {ctx,ink}=d,r=r0+(r1-r0)*settle(p);
  ctx.save();ctx.globalAlpha=1-p*p;ctx.strokeStyle=ink;ctx.lineCap='round';ctx.lineWidth=9*(1-p);
  for(let i=0;i<count;i++){const a=rad(from+(to-from)*(i+.5)/count),c=Math.cos(a),s=Math.sin(a),len=50*(1-p);ctx.beginPath();ctx.moveTo(x+c*r,y+s*r);ctx.lineTo(x+c*(r+len),y+s*(r+len));ctx.stroke()}
  ctx.restore();
}
// Three speed lines trailing a moving point.
function speed(d:Draw,now:Point,before:Point,strength:number){
  const {ctx,ink}=d,dx=now[0]-before[0],dy=now[1]-before[1],len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
  ctx.save();ctx.strokeStyle=ink;ctx.lineCap='round';ctx.globalAlpha=.9*strength;
  [-1,0,1].forEach((o,i)=>{const off=o*46,gap=70,back=90+i*30;ctx.lineWidth=8-Math.abs(o)*2;ctx.beginPath();
    ctx.moveTo(now[0]-ux*gap-uy*off,now[1]-uy*gap+ux*off);ctx.lineTo(now[0]-ux*(gap+back)-uy*off,now[1]-uy*(gap+back)+ux*off);ctx.stroke()});
  ctx.restore();
}

function frame(ctx:CanvasRenderingContext2D,width:number,height:number){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,width,height);
  ctx.save();
  ctx.scale(width/1750,height/1385);
  ctx.translate(248,240);
}

export function drawBrand(ctx: CanvasRenderingContext2D, width: number, height: number, t: number, theme: BrandTheme) {
  const palette = BRAND_THEMES[theme], d: Draw = {ctx, ink: palette.ink};
  const colors = [palette.ink, palette.ink, palette.mid, palette.pale, palette.ink];
  frame(ctx, width, height);
  // The whole mark swells in and wobbles like jelly once it is full.
  const grow = backOut(seg(t, 120, FILL[1])), jelly = wobble(t - JELLY, 2.6, 160);
  ctx.translate(CENTER[0], CENTER[1]);
  ctx.scale((.82 + .18 * grow) * (1 + .1 * jelly), (.82 + .18 * grow) * (1 - .1 * jelly));
  ctx.translate(-CENTER[0], -CENTER[1]);
  // The ink dot gathers itself before the stroke.
  const dot = seg(t, ...DOT as [number, number]), gone = seg(t, 160, 260);
  if (dot > 0 && gone < 1) {
    const [x, y] = polar(215, R_MID), r = (R_MID - R_IN) * .5 * backOut(dot), squash = 1 - .35 * Math.sin(Math.PI * dot);
    ctx.save(); ctx.globalAlpha = 1 - gone; ctx.fillStyle = palette.ink; ctx.beginPath(); ctx.ellipse(x, y, r / squash, r * squash, rad(215), 0, 2 * Math.PI); ctx.fill(); ctx.restore();
  }
  const fill = whoosh(seg(t, ...FILL as [number, number]));
  if (fill > 0) {
    const air = seg(t, ...AIR as [number, number]), {head, body} = roll(air);
    ctx.save();
    if (fill < 1) {
      // Clockwise from the first chart piece, with a round brush tip at the front.
      const start = rad(215), front = polar(215 + fill * 360, R_MID), tip = (R_OUT - R_IN) / 2;
      ctx.beginPath(); ctx.moveTo(CENTER[0], CENTER[1]); ctx.arc(CENTER[0], CENTER[1], 1200, start, start + fill * 2 * Math.PI); ctx.closePath();
      ctx.moveTo(front[0] + tip, front[1]); ctx.arc(front[0], front[1], tip, 0, 2 * Math.PI);
      ctx.clip();
    }
    body.forEach((part, i) => shape(d, part, colors[i + 1]));
    // The slice crouches toward the centre, jumps, and lands with a squash.
    const crouch = Math.sin(Math.PI * seg(t, ...CROUCH as [number, number])), land = wobble(t - LAND, 3.2, 110);
    shape(d, head, palette.ink, 1 + .14 * crouch - .2 * land, 1 - .22 * crouch + .26 * land, -90 * Math.sin(Math.PI * air));
    ctx.restore();
    burst(d, headAt(0), seg(t, AIR[0] - 20, AIR[0] + 220), 6, 70, 150);
    if (air > .08 && air < .85) {
      const lift = (p: number): Point => { const [x, y] = headAt(p); return [x, y - 90 * Math.sin(Math.PI * p)]; };
      speed(d, lift(air), lift(Math.max(0, air - .08)), 1 - Math.abs(air - .45) / .45);
    }
    burst(d, headAt(1), seg(t, LAND - 20, LAND + 200), 5, 60, 120, -160, -20);
  }
  ctx.restore();
}

// Handover: the mark becomes one ball of ink. The first stroke rolls back to
// its slot while every slice slides in to a sector of a solid disc, so the
// hole and the cuts close and the colours run to ink.
export const BALL = {x: CENTER[0], y: CENTER[1], r: R_OUT * .8};
// The seam stroke that closes the cuts adds half its width to the finished disc.
const SEAM = 44;
export const BALL_EDGE = BALL.r + SEAM / 2;
const SPANS = [[505, 575], [215, 302], [302, 385], [385, 445], [445, 505]];
const SECTORS = SPANS.map(([a, b]) => {
  const n = 48, edge = (p: Point, q: Point) => Array.from({length: n}, (_, k): Point => [p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n]);
  const at = (deg: number): Point => [CENTER[0] + Math.cos(rad(deg)) * BALL.r, CENTER[1] + Math.sin(rad(deg)) * BALL.r];
  return [...Array.from({length: n}, (_, k) => at(a + (b - a) * k / n)), ...edge(at(b), CENTER), ...Array.from({length: n}, (): Point => [...CENTER] as Point), ...edge(CENTER, at(a))];
});
const mixHex = (a: string, b: string, p: number) => `rgb(${[1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - p) + parseInt(b.slice(i, i + 2), 16) * p)).join(',')})`;
export function drawMelt(ctx: CanvasRenderingContext2D, width: number, height: number, m: number, theme: BrandTheme) {
  const palette = BRAND_THEMES[theme], colors = [palette.ink, palette.ink, palette.mid, palette.pale, palette.ink];
  const p = fillEase(m), {head, body} = roll(1 - Math.min(1, p * 1.5)), seam = fillEase(clamp((m - .3) / .5));
  frame(ctx, width, height);
  [head, ...body].forEach((part, i) => {
    const color = mixHex(colors[i], palette.ink, p);
    ctx.beginPath();
    part.forEach(([x, y], k) => { const q = SECTORS[i][k], px = x + (q[0] - x) * p, py = y + (q[1] - y) * p; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    if (seam > 0) { ctx.lineWidth = SEAM * seam; ctx.lineJoin = 'round'; ctx.strokeStyle = color; ctx.stroke(); }
  });
  ctx.restore();
}
