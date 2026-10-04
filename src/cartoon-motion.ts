// Cartoon Physics: the three springs every moving part of uchiwake shares.
// squish: a press that gives (0.94) and a release that overshoots (1.05).
// boing:  arrivals that land, overshoot once and settle.
// split:  things that tear apart or stretch; one edge leads, the other follows.
export type Spring={stiffness:number;damping:number;mass?:number};
export const SPRINGS={
  squish:{stiffness:520,damping:20},
  boing:{stiffness:420,damping:14},
  split:{stiffness:230,damping:21},
  lead:{stiffness:700,damping:34},
} as const satisfies Record<string,Spring>;
export type SpringName=keyof typeof SPRINGS;
export const SQUISH={press:.94,release:1.05} as const;

export const reducedMotion=()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Samples a unit spring (0→1) so CSS and WAAPI can play it as a linear() easing. */
export function springSamples({stiffness,damping,mass=1}:Spring,velocity=0,step=1/120,limit=2){
  const values=[0];let x=0,v=velocity,t=0;
  while(t<limit){
    const a=(-stiffness*(x-1)-damping*v)/mass;
    v+=a*step;x+=v*step;t+=step;values.push(x);
    if(Math.abs(x-1)<.0008&&Math.abs(v)<.01)break;
  }
  values[values.length-1]=1;
  return {values,duration:Math.round(t*1000)};
}

const cache=new Map<string,{easing:string;duration:number}>();
/** A spring as CSS: `linear(...)` easing plus the time it takes to settle. */
export function springEasing(name:SpringName|Spring,velocity=0){
  const spring:Spring=typeof name==='string'?SPRINGS[name]:name;
  const key=`${spring.stiffness}/${spring.damping}/${spring.mass??1}/${velocity}`;
  const hit=cache.get(key);if(hit)return hit;
  const {values,duration}=springSamples(spring,velocity);
  const stride=Math.max(1,Math.floor(values.length/64));
  const points=values.filter((_,i)=>i%stride===0||i===values.length-1).map(v=>+v.toFixed(4));
  const value={easing:`linear(${points.join(',')})`,duration};
  cache.set(key,value);return value;
}

/** Publishes the springs as custom properties so stylesheets can use them. */
export function installSpringTokens(root:HTMLElement=document.documentElement){
  let supported=false;
  try{supported=CSS.supports('transition-timing-function','linear(0, 1)');}catch{/* Older engines keep the fallback curves. */}
  for(const name of Object.keys(SPRINGS) as SpringName[]){
    const {easing,duration}=springEasing(name);
    if(supported)root.style.setProperty(`--spring-${name}`,easing);
    root.style.setProperty(`--spring-${name}-duration`,`${duration}ms`);
  }
}

/** Plays a spring between keyframes with WAAPI. */
export function springAnimate(element:Element,from:Keyframe,to:Keyframe,name:SpringName|Spring='boing',extra:KeyframeAnimationOptions={}){
  if(reducedMotion()||!element.animate)return null;
  const {easing,duration}=springEasing(name);
  try{return element.animate([from,to],{duration,easing,fill:'none',...extra});}
  catch{return element.animate([from,to],{duration:Math.min(duration,500),easing:'cubic-bezier(.34,1.56,.64,1)',fill:'none',...extra});}
}

/** A live spring for values driven by fingers (indicators, rubber bands). */
export class LiveSpring{
  value:number;target:number;velocity=0;
  private frame=0;private spring:Spring;
  constructor(value:number,private onFrame:(value:number)=>void,spring:SpringName|Spring='boing'){
    this.value=this.target=value;this.spring=typeof spring==='string'?SPRINGS[spring]:spring;
  }
  set(value:number){cancelAnimationFrame(this.frame);this.frame=0;this.value=this.target=value;this.velocity=0;this.onFrame(value);}
  to(target:number,spring?:SpringName|Spring,velocity?:number){
    this.target=target;if(spring)this.spring=typeof spring==='string'?SPRINGS[spring]:spring;
    if(velocity!==undefined)this.velocity=velocity;
    if(reducedMotion()){this.set(target);return;}
    if(!this.frame){let last=performance.now();const tick=(now:number)=>{
      const dt=Math.min(.032,(now-last)/1000);last=now;
      const {stiffness,damping,mass=1}=this.spring;
      for(let i=0;i<4;i++){const a=(-stiffness*(this.value-this.target)-damping*this.velocity)/mass;this.velocity+=a*dt/4;this.value+=this.velocity*dt/4;}
      if(Math.abs(this.value-this.target)<.0005&&Math.abs(this.velocity)<.005){this.value=this.target;this.velocity=0;this.frame=0;this.onFrame(this.value);return;}
      this.onFrame(this.value);this.frame=requestAnimationFrame(tick);
    };this.frame=requestAnimationFrame(tick);}
  }
  stop(){cancelAnimationFrame(this.frame);this.frame=0;}
}

/** Press feedback: give under the finger, overshoot on release. */
export function squishPress(element:HTMLElement){
  if(reducedMotion())return()=>{};
  const press=springAnimate(element,{scale:'1'},{scale:String(SQUISH.press)},'squish',{fill:'forwards'});
  return()=>{press?.cancel();springAnimate(element,{scale:String(SQUISH.press)},{scale:'1'},{stiffness:420,damping:11});};
}
