// Adapted from kondo's viewport and FormBackButton helpers (MIT).
export function panelEditor(focused:Element|null):HTMLElement|null {
  if(!(focused instanceof HTMLElement)||!focused.closest('.card-panel')||focused.closest('[inert]'))return null;
  if(!focused.matches("input, textarea, select, [contenteditable='true']")||focused.matches(':disabled, [readonly], input[type="checkbox"], input[type="radio"], input[type="button"], input[type="submit"], input[type="reset"], input[type="range"], input[type="file"], input[type="color"], input[type="hidden"]'))return null;
  return focused;
}

export function revealPanelField(focused:Element|null) {
  const editor=panelEditor(focused);
  const scroll=editor?.closest<HTMLElement>('.card-panel');
  if(!editor||!scroll)return;
  const bounds=scroll.getBoundingClientRect();
  const header=scroll.querySelector<HTMLElement>(':scope > .card-panel-header');
  const viewport=editor.ownerDocument.defaultView?.visualViewport;
  if(viewport&&Math.abs(viewport.scale-1)>=.01)return;
  const dock=editor.ownerDocument.querySelector<HTMLElement>('.floating-nav-host');
  const dockTop=dock?.getClientRects().length?dock.getBoundingClientRect().top-16:bounds.bottom;
  const top=Math.max(bounds.top,header?.getBoundingClientRect().bottom??bounds.top,viewport?.offsetTop??bounds.top)+12;
  const bottom=Math.min(bounds.bottom,dockTop,viewport?viewport.offsetTop+viewport.height:bounds.bottom)-12;
  if(bottom<=top)return;
  const input=editor.getBoundingClientRect();
  const field=editor.closest('.field, .statement-edit-field')?.getBoundingClientRect();
  const start=field&&input.bottom-field.top<=bottom-top?field.top:input.top;
  const end=Math.min(input.bottom,start+bottom-top);
  const delta=start<top?start-top:end>bottom?end-bottom:0;
  if(delta)scroll.scrollTop+=delta;
}
