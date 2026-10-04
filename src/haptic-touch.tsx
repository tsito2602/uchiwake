import {useLayoutEffect,useRef} from 'react';

export const ios=typeof navigator!=='undefined'&&(/iP(hone|ad|od)/.test(navigator.userAgent)||navigator.maxTouchPoints>1&&/Mac/.test(navigator.platform));
// iOS has no vibration API and plays its system tick only when a finger itself
// toggles a native switch. Controls that tick on iPhone carry an invisible
// switch over their surface. The tap toggles it first, and only then is the
// press handed to the control, so a control that re-renders or disappears on
// press cannot remove the switch before it has ticked.
// Android ticks through haptic() instead, so the layer is left out there.
export function HapticTouch(){
  const input=useRef<HTMLInputElement>(null),pressed=useRef(false);
  useLayoutEffect(()=>{
    const node=input.current,host=node?.parentElement;if(!node||!host)return;
    host.setAttribute('data-haptic-host','');
    // The native change event fires after the toggle is complete (React's
    // onChange for checkboxes fires earlier, during the click).
    const press=()=>{if(!pressed.current)return;pressed.current=false;host.click();};
    node.addEventListener('change',press);return()=>node.removeEventListener('change',press);
  },[]);
  if(!ios)return null;
  return <input ref={input} type="checkbox" {...{switch:''}} className="haptic-touch" tabIndex={-1} aria-hidden="true"
    onClick={event=>{event.stopPropagation();pressed.current=true;}}/>;
}
