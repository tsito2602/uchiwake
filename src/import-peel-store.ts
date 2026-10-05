import { useSyncExternalStore } from 'react';
import type { EntryDraft } from './domain';

// The reader (above the list) and the list (in the scroll area) are separate
// components. While the reader animates, it decides when each row may take
// its place in the list (admitted) and when it has landed there, so a row only
// appears once its strip has peeled off the statement and fallen into place.
// When the reader is not running (reduced motion, server render) the list shows
// every row as before.
type Snapshot={active:boolean;settled:boolean;admitted:ReadonlySet<string>;landed:ReadonlySet<string>};
const idle:Snapshot={active:false,settled:true,admitted:new Set(),landed:new Set()};
let snapshot=idle;
const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(listener=>listener());

export const peelStore={
  subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
  get:()=>snapshot,
  start(){snapshot={active:true,settled:false,admitted:new Set(),landed:new Set()};emit();},
  settle(){if(snapshot.active&&!snapshot.settled){snapshot={...snapshot,settled:true};emit();}},
  // The result screen waits for the last strip to land and the sheet to fold,
  // never longer than a few seconds.
  whenSettled(signal:AbortSignal,limit=8000){
    return new Promise<void>(resolve=>{
      if(snapshot.settled){resolve();return;}
      const done=()=>{clearTimeout(timer);unsubscribe();signal.removeEventListener('abort',done);resolve();};
      const timer=setTimeout(done,limit);
      const unsubscribe=peelStore.subscribe(()=>{if(snapshot.settled)done();});
      signal.addEventListener('abort',done,{once:true});
    });
  },
  stop(){snapshot=idle;emit();},
  admit(keys:string[]){
    if(!snapshot.active||keys.every(key=>snapshot.admitted.has(key)))return;
    snapshot={...snapshot,admitted:new Set([...snapshot.admitted,...keys])};emit();
  },
  land(keys:string[]){
    if(!snapshot.active||keys.every(key=>snapshot.landed.has(key)))return;
    snapshot={...snapshot,admitted:new Set([...snapshot.admitted,...keys]),landed:new Set([...snapshot.landed,...keys])};emit();
  },
};

export const entryKey=(entry:EntryDraft,index:number)=>entry.import_meta?.id??`#${index}`;
export const usePeel=()=>useSyncExternalStore(peelStore.subscribe,peelStore.get,()=>idle);
