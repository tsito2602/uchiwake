import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { dockKeyboardInset, panelEditor, revealPanelField } from '../src/panel-focus.ts';

class Field {
  constructor({kind='input',excluded=false,inert=false,top=300,bottom=344,labelTop=280}={}) {Object.assign(this,{kind,excluded,inert,top,bottom,labelTop});this.scroll={scrollTop:0,getBoundingClientRect:()=>({top:100,bottom:400})};}
  matches(selector) {if(selector==='select')return this.kind==='select';if(selector.startsWith(':disabled'))return this.excluded;return ['input','textarea','select'].includes(this.kind);}
  closest(selector) {if(selector==='[inert]')return this.inert?{}:null;if(selector==='.card-panel')return {};if(selector==='.card-panel-scroll')return this.scroll;if(selector==='.field')return {getBoundingClientRect:()=>({top:this.labelTop})};return null;}
  getBoundingClientRect(){return {top:this.top,bottom:this.bottom};}
}
globalThis.HTMLElement=Field;

test('フォーム入力のときだけキーボード分を持ち上げ、ピンチ・小さい変動・選択ピッカーは除外する',()=>{
  const field=new Field();
  assert.equal(dockKeyboardInset(800,{height:500,offsetTop:20,scale:1},field),280);
  assert.equal(dockKeyboardInset(800,{height:500,offsetTop:-10,scale:1},field),300);
  assert.equal(dockKeyboardInset(800,{height:500,offsetTop:0,scale:1.5},field),0);
  assert.equal(dockKeyboardInset(800,{height:720,offsetTop:0,scale:1},field),0);
  assert.equal(dockKeyboardInset(800,{height:500,offsetTop:0,scale:1},new Field({kind:'select'})),0);
  assert.equal(panelEditor(new Field({excluded:true})),null);
  assert.equal(panelEditor(new Field({inert:true})),null);
});

test('入力欄が見えていれば動かず、隠れた欄とラベルだけパネル内で表示する',()=>{
  const visible=new Field();revealPanelField(visible);assert.equal(visible.scroll.scrollTop,0);
  const below=new Field({top:390,bottom:434,labelTop:370});revealPanelField(below);assert.equal(below.scroll.scrollTop,46);
  const above=new Field({top:120,bottom:164,labelTop:90});revealPanelField(above);assert.equal(above.scroll.scrollTop,-22);
  const tall=new Field({kind:'textarea',top:200,bottom:600,labelTop:180});revealPanelField(tall);assert.equal(tall.scroll.scrollTop,88);
});
