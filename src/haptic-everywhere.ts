import {hapticLabel,ios,wire} from './haptic-touch';

// On iPhone every tappable control ticks, not only the ones that render a
// <HapticTouch/> themselves: each one gets the same invisible switch label
// over its surface. React may wipe it when it rewrites a control's text, so
// the labels are put back whenever the tree changes.
const tappable='button,a[href],[role=button],[role=menuitem],[role=tab],[role=option],[role=switch]';

function equip(host:HTMLElement){
  const own=host.querySelectorAll<HTMLElement>(':scope>.haptic-touch');
  if(own.length>1)for(const label of own)if(label.dataset.auto)label.remove();
  if(own.length||host.closest('[data-no-haptic]')||host.matches('input,select,textarea'))return;
  const label=hapticLabel();label.dataset.auto='1';
  host.appendChild(label);wire(label);
}

export function hapticEverywhere(){
  if(!ios)return;
  let queued=false;
  const scan=()=>{queued=false;for(const host of document.querySelectorAll<HTMLElement>(tappable))equip(host);};
  new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(scan);}}).observe(document.body,{childList:true,subtree:true});
  scan();
}
