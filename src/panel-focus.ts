// Adapted from kondo's viewport and FormBackButton helpers (MIT).
export function panelEditor(focused:Element|null):HTMLElement|null {
  if(!(focused instanceof HTMLElement)||!focused.closest('.card-panel')||focused.closest('[inert]'))return null;
  if(!focused.matches("input, textarea, select, [contenteditable='true']")||focused.matches(':disabled, [readonly], input[type="checkbox"], input[type="radio"], input[type="button"], input[type="submit"], input[type="reset"], input[type="range"], input[type="file"], input[type="color"], input[type="hidden"]'))return null;
  return focused;
}

export function dockKeyboardInset(layoutHeight:number,viewport:Pick<VisualViewport,'height'|'offsetTop'|'scale'>|null,focused:Element|null) {
  if(!viewport||Math.abs(viewport.scale-1)>.01)return 0;
  const editable=panelEditor(focused);
  if(!editable||editable.matches('select')||layoutHeight-viewport.height<120)return 0;
  return Math.max(0,layoutHeight-viewport.height-Math.max(0,viewport.offsetTop));
}

export function revealPanelField(focused:Element|null) {
  const editor=panelEditor(focused);
  const scroll=editor?.closest<HTMLElement>('.card-panel-scroll');
  if(!editor||!scroll)return;
  const bounds=scroll.getBoundingClientRect();
  const top=bounds.top+12,bottom=bounds.bottom-12;
  if(bottom<=top)return;
  const input=editor.getBoundingClientRect();
  const field=editor.closest('.field')?.getBoundingClientRect();
  const start=field&&input.bottom-field.top<=bottom-top?field.top:input.top;
  const end=Math.min(input.bottom,start+bottom-top);
  const delta=start<top?start-top:end>bottom?end-bottom:0;
  if(delta)scroll.scrollTop+=delta;
}
