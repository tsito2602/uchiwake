import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[new URL('../src/rounding-draw.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const {randomMemberIndex}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('抽選は各候補を選べ、偏りの出る乱数を引き直す',()=>{
 for(let count=1;count<=30;count++)for(let index=0;index<count;index++)assert.equal(randomMemberIndex(count,()=>index),index);
 const values=[0xffffffff,5];assert.equal(randomMemberIndex(3,()=>values.shift()),2);assert.equal(values.length,0);
 for(const count of [0,-1,1.5,NaN,0x100000001])assert.throws(()=>randomMemberIndex(count));
});
