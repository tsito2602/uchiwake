import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const {outputFiles}=await build({stdin:{contents:`
 import {createElement} from 'react';
 import {renderToStaticMarkup} from 'react-dom/server';
 import {AllocationBreakdown} from './src/allocation-breakdown';
 export const render=props=>renderToStaticMarkup(createElement(AllocationBreakdown,props));
`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node',packages:'external'});
const bundle=outputFiles[0].text.replace(/from "(react(?:-dom(?:\/server)?|\/jsx-runtime)?|lucide-react)"/g,(_match,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
const {render}=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'));
const base={month:'2026-09',userId:'b',members:[{user_id:'a',name:'あおい',active:true},{user_id:'b',name:'はる',active:true}],allocations:{a:501,b:500},adjustments:{a:1}};

test('端数を負担した人の金額にだけ調整を添え、追加請求ではないことを明示する',()=>{
 const html=render(base);
 assert.ok(html.includes('¥1,001'));
 assert.ok(html.indexOf('はる')<html.indexOf('あおい'));
 const rows=html.match(/<li\b[\s\S]*?<\/li>/g);
 assert.ok(!rows[0].includes('端数調整'));
 assert.ok(rows[1].includes('端数 +1円を含む'));
 assert.ok(!html.includes('合計に合わせて'));
 const unassigned=render({...base,allocations:{a:500,b:500},adjustments:{},unassigned:1});
 assert.ok(unassigned.includes('¥1,001'));
 assert.ok(unassigned.includes('端数 1円 · 未選択'));
 assert.ok(!unassigned.includes('円を含む'));
 assert.ok(!render({...base,allocations:{a:500,b:500},adjustments:{}}).includes('端数'));
 assert.ok(render({...base,allocations:{a:-501,b:-500},adjustments:{a:-1}}).includes('端数 −1円を含む'));
});

test('人数が多くても全員を一覧に保持し、0円・過去の参加者も確認できる',()=>{
 const members=Array.from({length:30},(_,i)=>({user_id:`p${i}`,name:`メンバー${i}`,active:i!==2}));
 const html=render({...base,userId:'p20',members,allocations:Object.fromEntries(members.map((m,i)=>[m.user_id,i])),adjustments:{}});
 assert.equal((html.match(/<li\b/g)||[]).length,30);
 assert.ok(html.includes('30人'));
 assert.ok(html.includes('¥0'));
 assert.ok(html.includes('現在は参加していません'));
 assert.ok(html.indexOf('メンバー20')<html.indexOf('メンバー0'));
 assert.ok(!html.includes('<button'));
});
