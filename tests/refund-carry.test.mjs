import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { spaceFixture } from './spaces-fixture.mjs';

const {outputFiles}=await build({stdin:{contents:`export {settlementItems} from './src/spaces';export {prepareStatementEdits,applyStatementEdit} from './src/statement-edit';`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node'});
const {settlementItems,prepareStatementEdits,applyStatementEdit}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
async function json(response,status=200){assert.equal(response.status,status,await response.clone().text());return response.json();}
async function create(f){await json(await f.call('owner','/spaces'));return (await json(await f.call('owner','/spaces','POST',{name:'ふたりの家計'}),201)).space;}
const refund=[{spent_on:'2026-09-02',title:'返品',category:'食費',amount:-5000},{spent_on:'2026-09-03',title:'スーパー',category:'食費',amount:1200}];

test('返金で合計がマイナスや0になる明細も登録できる',async()=>{
 const f=spaceFixture();try{
  const space=await create(f);
  const card=await json(await f.call('owner','/cards','POST',{name:'カード'},space.id),201);
  const saved=await json(await f.call('owner','/statements','POST',{card_id:card.id,due_month:'2026-09',title:'返金',confirmed_total:-3800,entries:refund},space.id),201);
  assert.equal(saved.confirmed_total,-3800);assert.equal(saved.carry_to_next,false);
  await json(await f.call('owner','/statements','POST',{card_id:card.id,due_month:'2026-10',title:'相殺',confirmed_total:0,entries:[{spent_on:'',title:'購入',category:'食費',amount:800},{spent_on:'',title:'取消',category:'食費',amount:-800}]},space.id),201);
  const state=await json(await f.call('owner','/state?month=2026-09','GET',undefined,space.id));
  assert.equal(state.statements[0].confirmed_total,-3800);
  assert.equal(settlementItems(state).find(item=>item.key===`card:${card.id}`).amount,-3800);
  // Only the size of the total is limited, and a carry needs a negative total.
  assert.equal((await f.call('owner','/statements','POST',{card_id:card.id,due_month:'2026-11',title:'大きすぎ',confirmed_total:-100_000_001,entries:[{spent_on:'',title:'返金',category:'食費',amount:-100_000_001}]},space.id)).status,400);
  assert.equal((await f.call('owner','/statements','POST',{card_id:card.id,due_month:'2026-11',title:'正',confirmed_total:500,carry_to_next:true,entries:[{spent_on:'',title:'購入',category:'食費',amount:500}]},space.id)).status,400);
 }finally{f.db.close();}
});

test('マイナス分を翌月の支払いから引くと、その月は0で翌月の同じカードから差し引く',async()=>{
 const f=spaceFixture();try{
  const space=await create(f);
  const card=await json(await f.call('owner','/cards','POST',{name:'カード'},space.id),201);
  const saved=await json(await f.call('owner','/statements','POST',{card_id:card.id,due_month:'2026-09',title:'返金',confirmed_total:-3800,carry_to_next:true,entries:refund},space.id),201);
  await json(await f.call('owner','/statements','POST',{card_id:card.id,due_month:'2026-10',title:'10月',confirmed_total:10000,entries:[{spent_on:'',title:'スーパー',category:'食費',amount:10000}]},space.id),201);
  const september=await json(await f.call('owner','/state?month=2026-09','GET',undefined,space.id));
  assert.equal(september.statements[0].carry_to_next,true);
  assert.equal(settlementItems(september).find(item=>item.key===`card:${card.id}`).amount,0);
  const october=await json(await f.call('owner','/state?month=2026-10','GET',undefined,space.id));
  assert.deepEqual(october.carried_statements.map(item=>item.id),[saved.id]);
  assert.equal(october.carried_entries.length,2);assert.equal(october.entries.length,1);
  assert.equal(settlementItems(october).find(item=>item.key===`card:${card.id}`).amount,6200);
  const history=await json(await f.call('owner','/settlement-history?month=2026-10&months=60','GET',undefined,space.id));
  assert.deepEqual(history.months.slice(-2).map(item=>item.total),[0,6200]);
  // Switching back counts the refund in its own month again.
  await json(await f.call('owner',`/statements/${saved.id}/carry`,'PUT',{carry_to_next:false,revision:0},space.id));
  const back=await json(await f.call('owner','/state?month=2026-10','GET',undefined,space.id));
  assert.equal(back.carried_statements.length,0);
  assert.equal(settlementItems(back).find(item=>item.key===`card:${card.id}`).amount,10000);
  assert.equal((await f.call('owner',`/statements/${saved.id}/carry`,'PUT',{carry_to_next:true,revision:0},space.id)).status,409);
 }finally{f.db.close();}
});

test('編集で合計がマイナスでなくなると繰り越しを外す',async()=>{
 const f=spaceFixture();try{
  const space=await create(f);
  const card=await json(await f.call('owner','/cards','POST',{name:'カード'},space.id),201);
  const saved=await json(await f.call('owner','/statements','POST',{card_id:card.id,due_month:'2026-09',title:'返金',confirmed_total:-3800,carry_to_next:true,entries:refund},space.id),201);
  const entries=f.db.prepare('SELECT id,category,amount FROM card_entries WHERE statement_id=? ORDER BY amount').all(saved.id);
  const edited=await json(await f.call('owner',`/statements/${saved.id}/entries`,'PUT',{revision:0,entries:[{...entries[0],amount:-500},entries[1]]},space.id));
  assert.equal(edited.confirmed_total,700);
  assert.equal(f.db.prepare('SELECT carry_to_next FROM card_statements WHERE id=?').get(saved.id).carry_to_next,0);
  assert.equal((await f.call('owner',`/statements/${saved.id}/carry`,'PUT',{carry_to_next:true,revision:1},space.id)).status,400);
  // The client validation accepts the same totals as the server.
  const statement={id:'s',revision:0,confirmed_total:-3800,carry_to_next:true};
  const local=[{id:'a',statement_id:'s',category:'食費',amount:-5000},{id:'b',statement_id:'s',category:'食費',amount:1200}];
  const negative=prepareStatementEdits([statement],local,{categories:{},amounts:{b:'1000'},deletedIds:[]});
  assert.equal(negative.valid,true);assert.equal(negative.changes[0].confirmed_total,-4000);
  assert.equal(applyStatementEdit({statements:[statement],entries:local},negative.changes[0]).statements[0].carry_to_next,true);
  const positive=prepareStatementEdits([statement],local,{categories:{},amounts:{a:'-100'},deletedIds:[]});
  assert.equal(applyStatementEdit({statements:[statement],entries:local},positive.changes[0]).statements[0].carry_to_next,false);
 }finally{f.db.close();}
});

test('移行0013は既存の明細と順番を保ち、索引・トリガーを戻す',()=>{
 const dir=new URL('../migrations/',import.meta.url);
 const files=readdirSync(dir).sort();assert.equal(files.at(-1),'0013_statement_refund_carry.sql');
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const name of files.slice(0,-1))db.exec(readFileSync(new URL(name,dir),'utf8'));
 db.exec("INSERT INTO spaces(id,name,kind,owner_id) VALUES('a','A','shared','o');INSERT INTO shared_cards(id,name,space_id) VALUES('c','C','a');INSERT INTO card_statements(id,due_month,title,confirmed_total,space_id,revision,card_id) VALUES('s','2026-09','t',100,'a',3,'c');INSERT INTO card_entries(id,statement_id,title,category,amount,space_id) VALUES('e2','s','y','食費',300,'a'),('e1','s','x','食費',-200,'a');");
 const schema="SELECT type,name,sql FROM sqlite_master WHERE name NOT IN ('card_statements','sqlite_autoindex_card_statements_1') ORDER BY type,name";
 const before={schema:db.prepare(schema).all(),entries:db.prepare('SELECT rowid,* FROM card_entries ORDER BY rowid').all()};
 // D1 applies a migration as one transaction.
 db.exec('BEGIN;'+readFileSync(new URL(files.at(-1),dir),'utf8')+'COMMIT;');
 assert.deepEqual(db.prepare(schema).all(),before.schema);
 assert.deepEqual(db.prepare('SELECT rowid,* FROM card_entries ORDER BY rowid').all(),before.entries);
 assert.deepEqual({...db.prepare('SELECT * FROM card_statements').get()},{id:'s',due_month:'2026-09',title:'t',confirmed_total:100,created_at:db.prepare('SELECT created_at FROM card_statements').get().created_at,card_id:'c',space_id:'a',revision:3,carry_to_next:0});
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 assert.throws(()=>db.exec("INSERT INTO card_entries(id,statement_id,title,category,amount,space_id) VALUES('x','missing','x','食費',1,'a')"),/statement space mismatch/);
 assert.throws(()=>db.exec("INSERT INTO card_statements(id,due_month,title,confirmed_total,space_id,card_id) VALUES('d','2026-09','t',5,'a','c')"),/UNIQUE/);
 assert.throws(()=>db.exec("INSERT INTO card_statements(id,due_month,title,confirmed_total,space_id,carry_to_next) VALUES('p','2026-10','t',5,'a',1)"),/CHECK/);
 db.exec("INSERT INTO card_statements(id,due_month,title,confirmed_total,space_id,carry_to_next) VALUES('n','2026-10','t',-5,'a',1)");
});

test('移行前のDBでも画面は読め、マイナスの保存だけ移行を求める',async()=>{
 const f=spaceFixture();try{
  const space=await create(f);
  const card=await json(await f.call('owner','/cards','POST',{name:'カード'},space.id),201);
  // Reverse 0013's column so the worker sees the pre-migration table.
  f.db.exec('ALTER TABLE card_statements DROP COLUMN carry_to_next');
  await json(await f.call('owner','/statements','POST',{card_id:card.id,due_month:'2026-09',title:'通常',confirmed_total:500,entries:[{spent_on:'',title:'購入',category:'食費',amount:500}]},space.id),201);
  const state=await json(await f.call('owner','/state?month=2026-09','GET',undefined,space.id));
  assert.equal(state.statements[0].carry_to_next,false);assert.deepEqual(state.carried_statements,[]);
  assert.equal((await f.call('owner','/statements','POST',{card_id:card.id,due_month:'2026-10',title:'返金',confirmed_total:-3800,entries:refund},space.id)).status,503);
 }finally{f.db.close();}
});
