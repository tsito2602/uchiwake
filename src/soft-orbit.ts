// The approved Soft Orbit preview: 12 continuous colors, a nine-second orbit,
// and three blurred layers. Clipping is applied after blur by the overlay CSS.
export const SOFT_ORBIT_STRENGTH = 0.7;
const TAU = Math.PI * 2;
const PADDING = 30;
const PALETTE = [[244,78,158],[193,79,221],[139,86,245],[85,103,249],
  [45,153,244],[36,190,230],[46,196,177],[100,198,127],
  [174,201,92],[234,190,80],[252,147,83],[252,105,117]];
const LAYERS = [[22,11,.28],[10,4.5,.42],[1.6,.6,.63]];
const wrap = (value:number) => ((value % 1) + 1) % 1;
type Point = [number,number];

function spectrum(position:number) {
  const phase=wrap(position)*PALETTE.length;
  const index=Math.floor(phase),t=phase-index,t2=t*t,t3=t2*t;
  const stop=(offset:number)=>PALETTE[(index+offset+PALETTE.length)%PALETTE.length];
  const a=stop(-1),b=stop(0),c=stop(1),d=stop(2);
  return b.map((v,i)=>Math.max(0,Math.min(255,.5*(2*v+(-a[i]+c[i])*t+
    (2*a[i]-5*v+4*c[i]-d[i])*t2+(-a[i]+3*v-3*c[i]+d[i])*t3))));
}

function boundary(width:number,height:number,distance:number):Point {
  const r=Math.min(28,width/4,height/4),x=PADDING,y=PADDING;
  const horizontal=width-2*r,vertical=height-2*r,arc=Math.PI*r/2;
  let d=wrap(distance)*(2*horizontal+2*vertical+4*arc);
  const lengths=[horizontal,arc,vertical,arc,horizontal,arc,vertical,arc];
  let edge=0;
  while(edge<7&&d>lengths[edge])d-=lengths[edge++];
  if(edge===0)return [x+r+d,y];
  if(edge===2)return [x+width,y+r+d];
  if(edge===4)return [x+width-r-d,y+height];
  if(edge===6)return [x,y+height-r-d];
  const centers:Record<number,Point>={1:[x+width-r,y+r],3:[x+width-r,y+height-r],5:[x+r,y+height-r],7:[x+r,y+r]};
  const angle=(edge-3)*Math.PI/4+d/r;
  return [centers[edge][0]+r*Math.cos(angle),centers[edge][1]+r*Math.sin(angle)];
}

function field(position:number,time:number) {
  const phase=time/9+.018*Math.sin(time*.72);
  let sum=0;
  for(let i=0;i<3;i++) {
    const center=wrap(phase+i/3+.023*Math.sin(time*.53+i*2));
    const delta=wrap(position-center+.5)-.5;
    const sigma=.074+.019*(.5+.5*Math.sin(time*.84+i));
    sum+=Math.exp(-(delta*delta)/(2*sigma*sigma));
  }
  return {color:spectrum(position-phase+.018*Math.sin(position*TAU*2-time*.4)),
    opacity:.08+.92*Math.min(sum,1),width:.72+.45*Math.min(sum,1)};
}

export function startSoftOrbit(container:HTMLElement,canvases:HTMLCanvasElement[]) {
  if(canvases.length!==LAYERS.length)return ()=>{};
  const contexts=canvases.map(canvas=>canvas.getContext('2d'));
  if(contexts.some(context=>!context))return ()=>{};
  const brushes=contexts as CanvasRenderingContext2D[];
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let width=0,height=0,pixelRatio=0,clock=0,previous:number|null=null,frame=0,disposed=false;
  let points:Point[]=[];
  canvases.forEach((canvas,i)=>{canvas.style.filter=`blur(${LAYERS[i][1]}px)`;});

  function measure() {
    // Layout dimensions stay stable while the floating panel scales into view.
    const nextWidth=container.clientWidth,nextHeight=container.clientHeight;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    if(!nextWidth||!nextHeight)return false;
    if(nextWidth===width&&nextHeight===height&&dpr===pixelRatio)return true;
    width=nextWidth;height=nextHeight;pixelRatio=dpr;
    canvases.forEach((canvas,i)=>{
      canvas.width=Math.ceil((width+PADDING*2)*dpr);
      canvas.height=Math.ceil((height+PADDING*2)*dpr);
      brushes[i].setTransform(dpr,0,0,dpr,0,0);
    });
    const count=Math.ceil((width+height)*2/7);
    points=Array.from({length:count+1},(_,i)=>boundary(width,height,i/count));
    return true;
  }

  function draw() {
    if(disposed||!measure())return;
    const count=points.length-1,time=reduced.matches?1.8:clock;
    const fields=Array.from({length:count+1},(_,i)=>field(i/count,time));
    for(let layer=0;layer<LAYERS.length;layer++) {
      const [strokeWidth,,alpha]=LAYERS[layer],brush=brushes[layer];
      const rgba=(sample:ReturnType<typeof field>)=>`rgba(${sample.color.map(Math.round).join(',')},${Math.min(.95,alpha*sample.opacity*SOFT_ORBIT_STRENGTH)})`;
      brush.lineCap='round';brush.lineJoin='round';
      brush.clearRect(0,0,width+PADDING*2,height+PADDING*2);
      for(let i=0;i<count;i++) {
        const a=points[i],b=points[i+1];
        const gradient=brush.createLinearGradient(a[0],a[1],b[0],b[1]);
        gradient.addColorStop(0,rgba(fields[i]));gradient.addColorStop(1,rgba(fields[i+1]));
        brush.strokeStyle=gradient;brush.lineWidth=strokeWidth*fields[i].width;
        brush.beginPath();brush.moveTo(a[0],a[1]);brush.lineTo(b[0],b[1]);brush.stroke();
      }
    }
  }

  function tick(now:number) {
    frame=0;
    if(disposed||document.hidden||reduced.matches)return;
    if(previous!==null)clock+=Math.min((now-previous)/1000,.05);
    previous=now;draw();frame=requestAnimationFrame(tick);
  }
  function resume() {
    if(frame)cancelAnimationFrame(frame);
    frame=0;previous=null;
    if(disposed||document.hidden)return;
    draw();
    if(!reduced.matches)frame=requestAnimationFrame(tick);
  }
  const resize=new ResizeObserver(draw);
  resize.observe(container);
  reduced.addEventListener('change',resume);
  document.addEventListener('visibilitychange',resume);
  resume();
  return ()=>{
    disposed=true;
    if(frame)cancelAnimationFrame(frame);
    resize.disconnect();
    reduced.removeEventListener('change',resume);
    document.removeEventListener('visibilitychange',resume);
  };
}
