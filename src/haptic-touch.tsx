import {useLayoutEffect,useRef} from 'react';

export const ios=typeof navigator!=='undefined'&&(/iP(hone|ad|od)/.test(navigator.userAgent)||navigator.maxTouchPoints>1&&/Mac/.test(navigator.platform));
// iOS has no vibration API and plays its system tick only when a tap toggles a
// native switch. Controls that tick on iPhone carry an invisible label over
// their surface that toggles a hidden switch. A label, not the switch itself:
// a switch under the finger tracks it like a slider, so a scroll that starts
// on a control would stall and then press it. A label leaves scrolling to the
// page and only activates on a real tap. The tap toggles the switch first,
// and only then is the press handed to the control, so a control that
// re-renders or disappears on press cannot remove the switch before it ticks.
// Android ticks through haptic() instead, so the layer is left out there.
export function HapticTouch(){
  const label=useRef<HTMLLabelElement>(null);
  useLayoutEffect(()=>{const node=label.current;if(node)return wire(node);},[]);
  if(!ios)return null;
  return <label ref={label} className="haptic-touch" aria-hidden="true"><input type="checkbox" {...{switch:''}} tabIndex={-1}/></label>;
}

export function hapticLabel(){
  const label=document.createElement('label'),input=document.createElement('input');
  label.className='haptic-touch';label.setAttribute('aria-hidden','true');
  input.type='checkbox';input.setAttribute('switch','');input.tabIndex=-1;
  label.appendChild(input);
  return label;
}

export function wire(label:HTMLLabelElement){
  const host=label.parentElement,input=label.querySelector('input');if(!host||!input)return;
  host.setAttribute('data-haptic-host','');
  let pressed=false;
  const tap=(event:Event)=>{event.stopPropagation();if(event.target===label)pressed=true;};
  // The change event fires after the toggle is complete.
  const press=()=>{if(!pressed)return;pressed=false;host.click();};
  label.addEventListener('click',tap);input.addEventListener('change',press);
  return()=>{label.removeEventListener('click',tap);input.removeEventListener('change',press);};
}
