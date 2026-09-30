// Move only the panel's list; never scroll the page or its fixed phase header.
export function scrollImportToLatest(viewport:Pick<HTMLElement,'scrollHeight'|'clientHeight'|'scrollTo'>,reducedMotion:boolean) {
  viewport.scrollTo({top:Math.max(0,viewport.scrollHeight-viewport.clientHeight),behavior:reducedMotion?'instant':'smooth'});
}
