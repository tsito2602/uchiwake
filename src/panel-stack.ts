const panels:HTMLElement[]=[];

// Nested editors share one page backdrop; only the front panel handles keys.
export function registerPanel(panel:HTMLElement) {
 const parents=[...panels];
 panels.push(panel);
 let released=false;
 return {
  parents,
  ownsBackground:parents.length===0,
  isTop:()=>!released&&panels.at(-1)===panel,
  release:()=>{if(released)return;released=true;const index=panels.indexOf(panel);if(index>=0)panels.splice(index,1);}
 };
}
