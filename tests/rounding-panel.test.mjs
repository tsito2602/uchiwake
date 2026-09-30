import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

// Exercise the panel's event contract without a browser: real JSX, deterministic hook scheduling.
const harness=`
 let slots=[],cursor=0,effects=[];
 export function reset(){slots=[];cursor=0;effects=[];}
 export function render(fn){cursor=0;return fn();}
 export function unmount(){effects.forEach(fn=>fn?.());}
 export function useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];}
 export function useRef(initial){const i=cursor++;return slots[i]??=( {current:initial} );}
 export function useEffect(fn){const i=cursor++;if(!(i in slots)){slots[i]=true;effects.push(fn());}}
`;
const {outputFiles}=await build({stdin:{contents:`export {AllocationBreakdownPanel as Panel} from './src/allocation-breakdown';export {reset,render,unmount} from 'react';`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node',packages:'external',plugins:[{name:'hook-host',setup(b){b.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:harness}));b.onResolve({filter:/^\.\/space-panel$/},()=>({path:'panel',namespace:'panel'}));b.onLoad({filter:/.*/,namespace:'panel'},()=>({contents:'export function SpacePanel(){}'}));}}]});
const bundle=outputFiles[0].text.replace(/from "(react\/jsx-runtime|lucide-react)"/g,(_match,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
const {Panel,reset,render,unmount}=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'));
function nodes(element){if(!element||typeof element!=='object')return[];return[element,...[element.props?.children].flat(Infinity).flatMap(nodes)];}
function fixture({saved=null,reduced=false,fail=false}={}){
 reset();const timers=new Map();let timerId=0,saves=[],closed=false,reloaded=false;
 const originalWindow=globalThis.window,originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 globalThis.window={matchMedia:()=>({matches:reduced})};globalThis.setTimeout=fn=>{timers.set(++timerId,fn);return timerId;};globalThis.clearTimeout=id=>timers.delete(id);
 const props={month:'2026-09',spaceId:'shared',userId:'a',members:[{user_id:'a',name:'あおい',active:true},{user_id:'b',name:'はる',active:true}],items:[{key:'rent',amount:1001,label:'家賃'}],settings:{scope:'month',month:'2026-09',revision:3,config:{uniform:true,common:{mode:'equal',shares:[{user_id:'a',weight:1},{user_id:'b',weight:1}]},items:{},roundingUserId:saved}},onClose(){closed=true;},onDockChange(){},async api(path,options){saves.push({path,body:JSON.parse(options.body)});if(fail)throw new Error('保存できませんでした');},async onSaved(){reloaded=true;}};
 const view=()=>render(()=>Panel(props));
 return {view,choose(label){nodes(view()).find(node=>node.type==='input'&&node.props['aria-label']===label).props.onChange();},flush(){while(timers.size){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}},timers,saves,get reloaded(){return reloaded;},cleanup(){unmount();globalThis.window=originalWindow;globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}};
}
test('手動選択は保存まで送信せず、解除と保存エラーを維持する',async()=>{
 const f=fixture({saved:'a',fail:true});try{
  assert.equal(f.view().props.context.actionLabel,'ランダムで決める');
  f.choose('未選択');assert.equal(f.saves.length,0);assert.equal(f.view().props.context.actionLabel,'保存');
  await f.view().props.context.onAction();
  assert.deepEqual(f.saves[0],{path:'/spaces/shared/rounding',body:{month:'2026-09',user_id:null,revision:3}});
  assert.equal(f.view().props.closing,false);assert.equal(f.reloaded,false);
  assert.ok(nodes(f.view()).some(node=>node.props?.role==='alert'));
 }finally{f.cleanup();}
});
test('抽選中は操作を無効化し、結果を保存して初めて共有する',async()=>{
 const f=fixture();try{
  f.view().props.context.onAction();
  assert.equal(f.view().props.context.disabled,true);assert.equal(f.view().props.context.actionLabel,'抽選中…');
  f.view().props.context.onAction();assert.equal(f.timers.size,1);assert.equal(f.saves.length,0);
  f.flush();assert.equal(f.view().props.context.actionLabel,'保存');assert.equal(f.view().props.context.disabled,false);
  assert.equal(f.saves.length,0);assert.ok(nodes(f.view()).some(node=>node.props?.['data-phase']==='result'));
  await f.view().props.context.onAction();await new Promise(setImmediate);assert.equal(f.saves.length,1);assert.ok(['a','b'].includes(f.saves[0].body.user_id));assert.equal(f.reloaded,true);assert.equal(f.view().props.closing,true);
 }finally{f.cleanup();}
});
test('抽選中に閉じても未保存のままで、動きを減らす設定では即座に結果を示す',()=>{
 let f=fixture();try{
  f.view().props.context.onAction();f.view().props.context.onBack();assert.equal(f.timers.size,0);assert.equal(f.saves.length,0);assert.equal(f.view().props.closing,true);
 }finally{f.cleanup();}
 f=fixture({reduced:true});try{
  f.view().props.context.onAction();assert.equal(f.timers.size,0);assert.equal(f.view().props.context.actionLabel,'保存');assert.equal(f.saves.length,0);
 }finally{f.cleanup();}
});
