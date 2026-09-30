import { useEffect, useRef } from 'react';
import { SOFT_ORBIT_STRENGTH, startSoftOrbit } from './soft-orbit';

export function SoftOrbitGlow() {
  const overlay=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!overlay.current)return;
    return startSoftOrbit(overlay.current,Array.from(overlay.current.querySelectorAll('canvas')));
  },[]);
  return <div ref={overlay} className="soft-orbit-glow" data-strength={SOFT_ORBIT_STRENGTH} aria-hidden="true">
    <canvas/><canvas/><canvas/>
  </div>;
}
