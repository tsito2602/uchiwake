import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { build } from 'esbuild';

const {outputFiles}=await build({entryPoints:[new URL('../src/kondo-fluid-dock.tsx',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const {prepareDockMorph,morphDock,dockSlots,dockContour}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

const tabs={left:0,width:140,radius:28};
const add={left:313,width:56,radius:28};
const slots=month=>dockSlots(369,[tabs,month,add]).map((island,slot)=>({...island,slot,tint:slot===2?1:0}));
const browse=slots({left:148,width:157,radius:28});
const settings=slots(null);

function verifyFrames(from,to,tension=0){
  const plan=prepareDockMorph(from,to,true);
  for(let frame=0;frame<=60;frame++){
    const state=morphDock(from,to,tension,frame/60,plan);
    const button=state.islands.filter(island=>island.slot===2);
    assert.equal(button.length,1);
    for(const key of ['left','width','radius','tint'])assert.equal(button[0][key],browse[2][key],`${key} changed at frame ${frame}`);
    if(frame>0&&frame<60)assert.equal(button[0].blend,false);
    assert.equal(dockContour(369,button,state.tension),dockContour(369,[browse[2]],0));
  }
}

test('設定への往復中、追加ボタンの黒背景・寸法・輪郭は全フレーム維持する',()=>{
  verifyFrames(browse,settings);
  verifyFrames(settings,browse);
  const end=morphDock(browse,settings,0,1,prepareDockMorph(browse,settings,true));
  assert.equal(end.islands[1].width,0);
});

test('年月は縮んで消えず、通常の変形と同じ半径でタブの島へ合流する',()=>{
  for(const [from,to] of [[browse,settings],[settings,browse]]){
    const plan=prepareDockMorph(from,to,true);
    const standard=prepareDockMorph(from.filter(island=>island.slot!==2),to.filter(island=>island.slot!==2));
    assert.deepEqual(plan.from.slice(0,-1),standard.from);
    assert.deepEqual(plan.to.slice(0,-1),standard.to);
    for(const progress of [.1,.3,.5,.8,.99]){
      const state=morphDock(from,to,0,progress,plan);
      assert.ok(state.tension>0);
      for(const island of state.islands){
        assert.equal(island.radius,28);
        assert.ok(island.width>=56);
      }
    }
    // Splitting a capsule changes its representation, not the final outline.
    assert.equal(dockContour(369,plan.to,0),dockContour(369,to,0));
  }
});

test('年月の島の変形途中でページを戻しても追加ボタンは薄くならない',()=>{
  for(const progress of [.05,.2,.4,.8]){
    const interrupted=morphDock(browse,settings,0,progress,prepareDockMorph(browse,settings,true));
    verifyFrames(interrupted.islands,browse,interrupted.tension);
  }
});
