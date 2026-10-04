import {ios} from './haptic-touch';

// On iPhone every tappable control ticks, not only the ones that render a
// <HapticTouch/> themselves: each one gets the same invisible native switch
// over its surface. React may wipe it when it rewrites a control's text, so
// the switches are put back whenever the tree changes.
const tappable='button,a[href],[role=button],[role=menuitem],[role=tab],[role=option],[role=switch]';

function equip(host:HTMLElement){
  const own=host.querySelectorAll<HTMLInputElement>(':scope>.haptic-touch');
  if(own.length>1)for(const input of own)if(input.dataset.auto)input.remove();
  if(own.length||host.closest('[data-no-haptic]')||host.matches('input,select,textarea'))return;
  const input=document.createElement('input');
  input.type='checkbox';input.setAttribute('switch','');input.className='haptic-touch';input.tabIndex=-1;
  input.setAttribute('aria-hidden','true');input.dataset.auto='1';
  let pressed=false;
  input.addEventListener('click',event=>{event.stopPropagation();pressed=true;});
  input.addEventListener('change',()=>{if(!pressed)return;pressed=false;host.click();});
  host.setAttribute('data-haptic-host','');
  host.appendChild(input);
}

export function hapticEverywhere(){
  if(!ios)return;
  let queued=false;
  const scan=()=>{queued=false;for(const host of document.querySelectorAll<HTMLElement>(tappable))equip(host);};
  new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(scan);}}).observe(document.body,{childList:true,subtree:true});
  scan();
}
