import {build} from 'esbuild';

const {outputFiles}=await build({entryPoints:[new URL('../src/overlay-lock.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
export const {lockOverlayBackground}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

class Style {
 constructor(){this.overflow='';this.priorities=new Map();}
 getPropertyValue(key){return this[key]??'';}
 getPropertyPriority(key){return this.priorities.get(key)??'';}
 setProperty(key,value,priority=''){this[key]=value;this.priorities.set(key,priority);}
 removeProperty(key){this[key]='';this.priorities.delete(key);}
}
export function overlayPage(overflow='',ios=false){
 const view=Object.assign(new EventTarget(),{scrollX:0,scrollY:240,navigator:{userAgent:ios?'iPhone':'Desktop',platform:'',maxTouchPoints:ios?1:0},scrollTo({left,top}){this.scrollX=left;this.scrollY=top;}});
 const doc=Object.assign(new EventTarget(),{defaultView:view,documentElement:{style:new Style()}});
 const body={style:new Style(),ownerDocument:doc};body.style.overflow=overflow;
 return{body,root:doc.documentElement,view,main:{inert:false},dock:{inert:false},switcher:{inert:false}};
}
