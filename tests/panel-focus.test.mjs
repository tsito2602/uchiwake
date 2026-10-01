import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { panelEditor, revealPanelField } from '../src/panel-focus.ts';

class Field {
  constructor({kind='input',excluded=false,inert=false,top=300,bottom=344,labelTop=280,headerBottom=100,panelBottom=400,viewport=null,dockTop=null,dockVisible=true}={}) {
    Object.assign(this,{kind,excluded,inert,top,bottom,labelTop});
    this.scroll={scrollTop:0,getBoundingClientRect:()=>({top:100,bottom:panelBottom}),querySelector:()=>({getBoundingClientRect:()=>({bottom:headerBottom})})};
    this.ownerDocument={defaultView:{visualViewport:viewport},querySelector:()=>dockTop===null?null:{getClientRects:()=>dockVisible?[{}]:[],getBoundingClientRect:()=>({top:dockTop})}};
  }
  matches(selector) {if(selector==='select')return this.kind==='select';if(selector.startsWith(':disabled'))return this.excluded;return ['input','textarea','select'].includes(this.kind);}
  closest(selector) {if(selector==='[inert]')return this.inert?{}:null;if(selector==='.card-panel')return this.scroll;if(selector==='.field')return {getBoundingClientRect:()=>({top:this.labelTop})};return null;}
  getBoundingClientRect(){return {top:this.top,bottom:this.bottom};}
}
globalThis.HTMLElement=Field;

test('操作可能なパネル内の入力欄だけをスクロール対象にする',()=>{
  const field=new Field();
  assert.equal(panelEditor(field),field);
  assert.equal(panelEditor(new Field({excluded:true})),null);
  assert.equal(panelEditor(new Field({inert:true})),null);
  assert.equal(panelEditor(null),null);
});

test('入力欄が見えていれば動かず、隠れた欄とラベルだけパネル内で表示する',()=>{
  const visible=new Field();revealPanelField(visible);assert.equal(visible.scroll.scrollTop,0);
  const below=new Field({top:390,bottom:434,labelTop:370});revealPanelField(below);assert.equal(below.scroll.scrollTop,46);
  const above=new Field({top:120,bottom:164,labelTop:90});revealPanelField(above);assert.equal(above.scroll.scrollTop,-22);
  const tall=new Field({kind:'textarea',top:200,bottom:600,labelTop:180});revealPanelField(tall);assert.equal(tall.scroll.scrollTop,88);
});


test('固定ヘッダーに隠れた入力欄とラベルを、パネル自体のスクロールで露出する',()=>{
 const hidden=new Field({top:170,bottom:214,labelTop:150,headerBottom:188});
 revealPanelField(hidden);assert.equal(hidden.scroll.scrollTop,-50);
 const visible=new Field({top:220,bottom:264,labelTop:200,headerBottom:188});
 revealPanelField(visible);assert.equal(visible.scroll.scrollTop,0);
});

test('ボトムナビが元の位置にあっても入力欄とラベルをキーボードより上に出す',()=>{
 const options={panelBottom:760,viewport:{height:470,offsetTop:0,scale:1},dockTop:780};
 const below=new Field({...options,top:600,bottom:644,labelTop:580});
 revealPanelField(below);assert.equal(below.scroll.scrollTop,186);
 const visible=new Field({...options,top:400,bottom:444,labelTop:380});
 revealPanelField(visible);assert.equal(visible.scroll.scrollTop,0);
 const hiddenDock=new Field({...options,top:450,bottom:494,labelTop:430,dockVisible:false});
 revealPanelField(hiddenDock);assert.equal(hiddenDock.scroll.scrollTop,36);
});

test('キーボードを閉じた後やピンチズーム中には不要なスクロールをしない',()=>{
 const field=new Field({panelBottom:760,top:600,bottom:644,labelTop:580,viewport:{height:844,offsetTop:0,scale:1},dockTop:780});
 revealPanelField(field);assert.equal(field.scroll.scrollTop,0);
 field.ownerDocument.defaultView.visualViewport={height:422,offsetTop:0,scale:2};
 revealPanelField(field);assert.equal(field.scroll.scrollTop,0);
});
