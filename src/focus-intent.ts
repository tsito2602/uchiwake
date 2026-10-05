// Menus move focus onto their first item only when they were opened from the
// keyboard. After a tap, that focus would light a ring around the first item.
let keyboard=false;
if(typeof document!=='undefined'){
  document.addEventListener('keydown',()=>{keyboard=true;},true);
  document.addEventListener('pointerdown',()=>{keyboard=false;},true);
}
export const openedByKeyboard=()=>keyboard;
