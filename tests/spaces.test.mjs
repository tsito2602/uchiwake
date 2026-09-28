import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spaceFixture } from './spaces-fixture.mjs';
const {outputFiles}=await build({entryPoints:[new URL('../src/spaces.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const {allocate,settlementDetails,settlementAmounts,settlementItems,validateConfig}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const equal=(...ids)=>({mode:'equal',shares:ids.map(user_id=>({user_id,weight:1}))});
const percent=(...weights)=>({mode:'percent',shares:weights.map(([user_id,weight])=>({user_id,weight}))});
const config=(common,items={})=>({uniform:!Object.keys(items).length,common,items});
async function json(response,status=200){assert.equal(response.status,status,await response.clone().text());return response.json();}
async function create(f,user='owner'){await json(await f.call(user,'/spaces'));return (await json(await f.call(user,'/spaces','POST',{name:'ふたりの家計'}),201)).space;}
async function invite(f,space,user){const {code}=await json(await f.call('owner',`/spaces/${space.id}/invites`,'POST',{}),201);const preview=await json(await f.call(user,'/spaces/invite-preview','POST',{code}));await json(await f.call(user,'/spaces/join','POST',{code,space_id:preview.space_id}));return code;}

test('均等・割合・返金の端数配分は常に合計に一致する',()=>{
 assert.deepEqual(allocate(100,equal('a','b','c')),{a:34,b:33,c:33});
 assert.deepEqual(allocate(101,percent(['a',5000],['b',3000],['c',2000])),{a:51,b:30,c:20});
 assert.deepEqual(allocate(-101,percent(['a',5000],['b',3000],['c',2000])),{a:-51,b:-30,c:-20});
 for(let n=-200;n<200;n++)assert.equal(Object.values(allocate(n,equal('a','b','c'))).reduce((a,b)=>a+b,0),n);
 const c=config(equal('a','b'),{rent:percent(['a',6000],['b',4000]),'card:c':equal('a','b','c')});
 assert.deepEqual(settlementAmounts([{key:'rent',amount:100000},{key:'card:c',amount:3000}],c),{a:61000,b:41000,c:1000});
 assert.deepEqual(settlementAmounts([{key:'rent',amount:100000},{key:'card:c',amount:3000}],{...c,uniform:true}),{a:51500,b:51500});
 assert.equal(validateConfig(config(percent(['a',5000],['b',4999])),new Set(['a','b'])),false);
 assert.equal(validateConfig(config(equal('a','a')),new Set(['a'])),false);
 assert.equal(validateConfig(config(equal('outsider')),new Set(['a'])),false);
});

test('個人・複数共有の作成と、既存データの安全な所有者移行',async()=>{
 const f=spaceFixture();try{
  const outsider=await json(await f.call('outsider','/spaces'));assert.equal(outsider.spaces.length,1);assert.equal(outsider.spaces[0].kind,'personal');
  const owner=await json(await f.call('owner','/spaces'));assert.equal(owner.spaces.length,2);assert.equal(owner.spaces.find(s=>s.id==='legacy').owner_id,'owner');
  await create(f);await create(f);assert.equal((await json(await f.call('owner','/spaces'))).spaces.length,4);
  assert.equal((await f.call('outsider','/state?month=2026-09','GET',undefined,'legacy')).status,404);
  assert.equal((await f.call('owner','/state?month=2026-09')).status,400);
 }finally{f.db.close();}
});

test('招待は確認後に参加でき、3人以上に対応し、再利用・権限外招待を拒否する',async()=>{
 const f=spaceFixture();try{
  const space=await create(f),code=await invite(f,space,'b');await invite(f,space,'c');
  const data=await json(await f.call('b',`/spaces/${space.id}/details?month=2026-09`));assert.equal(data.members.length,3);
  assert.equal((await f.call('outsider','/spaces/join','POST',{code,space_id:space.id})).status,404);
  assert.equal((await f.call('b',`/spaces/${space.id}/invites`,'POST',{})).status,403);
  assert.equal((await f.call('b',`/spaces/${space.id}/space`,'DELETE')).status,403);
  assert.equal((await f.call('outsider',`/spaces/personal:owner/invites`,'POST',{})).status,404);
  assert.equal((await f.call('owner','/spaces/personal:owner/space','DELETE')).status,403);
  const row=f.db.prepare('SELECT code_hash FROM space_invites LIMIT 1').get();assert.match(row.code_hash,/^[a-f0-9]{64}$/);assert.ok(!row.code_hash.includes(code));
 }finally{f.db.close();}
});

test('メンバーの画像を所属スペース内で返し、不正な画像URLは公開しない',async()=>{
 const f=spaceFixture();try{
  const space=await create(f);await invite(f,space,'b');await invite(f,space,'c');
  const avatar='https://lh3.googleusercontent.com/owner-avatar';
  f.db.prepare('INSERT INTO user_profiles(user_id,display_name,avatar_url) VALUES (?,?,?)').run('owner','オーナー',avatar);
  f.db.prepare('INSERT INTO user_profiles(user_id,avatar_url) VALUES (?,?)').run('b','https://example.test/avatar');
  for(const [path,spaceId] of [[`/spaces/${space.id}/details?month=2026-09`,undefined],['/state?month=2026-09',space.id]]){
   const {members}=await json(await f.call('c',path,'GET',undefined,spaceId));
   assert.deepEqual(members.find(m=>m.user_id==='owner'),{user_id:'owner',name:'オーナー',active:true,avatarUrl:avatar});
   for(const id of ['b','c'])assert.deepEqual(members.find(m=>m.user_id===id),{user_id:id,name:id,active:true});
   assert.equal((await f.call('outsider',path,'GET',undefined,spaceId)).status,404);
  }
 }finally{f.db.close();}
});

test('招待コードの期限と試行回数を検証する',async()=>{
 const f=spaceFixture();try{
  const space=await create(f),{code}=await json(await f.call('owner',`/spaces/${space.id}/invites`,'POST',{}),201);
  f.db.exec('UPDATE space_invites SET expires_at=0');assert.equal((await f.call('b','/spaces/invite-preview','POST',{code})).status,404);
  for(let i=0;i<20;i++)await f.call('c','/spaces/invite-preview','POST',{code:'bad'});
  assert.equal((await f.call('c','/spaces/invite-preview','POST',{code})).status,429);
 }finally{f.db.close();}
});

test('別スペースのカード・明細・家賃・費目を読み書きできない',async()=>{
 const f=spaceFixture();try{
  const one=await create(f),two=await create(f);await invite(f,one,'b');
  const card=await json(await f.call('owner','/cards','POST',{name:'秘密のカード'},two.id),201);
  const bill=await json(await f.call('owner','/bills','POST',{due_month:'2026-09',title:'固定費',kind:'other',amount:500},two.id),201);
  await json(await f.call('owner','/rent-rules/2026-09','PUT',{amount:100000},two.id));
  const statement=await json(await f.call('owner','/statements','POST',{card_id:card.id,due_month:'2026-09',title:'明細',confirmed_total:1000,entries:[{spent_on:'',title:'利用',category:'食費',amount:1000}]},two.id),201);
  const entry=f.db.prepare('SELECT id FROM card_entries WHERE statement_id=?').get(statement.id);
  for(const [path,method,body] of [[`/cards/${card.id}`,'DELETE'],[`/bills/${bill.id}`,'DELETE'],[`/statements/${statement.id}`,'DELETE'],[`/card-entries/${entry.id}/category`,'PUT',{category:'外食費'}]])assert.equal((await f.call('b',path,method,body,one.id)).status,404);
  assert.equal((await f.call('b','/rent-rules/2026-09','DELETE',undefined,one.id)).status,404);
  const state=await json(await f.call('b','/state?month=2026-09','GET',undefined,one.id));assert.equal(state.entries.length,0);assert.equal(state.cards.length,0);assert.equal(state.rent_rules.length,0);
  assert.equal((await f.call('b','/state?month=2026-09','GET',undefined,two.id)).status,404);
  const body={category:'食材費',icon:'utensils',color:'#b78d6a'};await json(await f.call('b','/category-settings/'+encodeURIComponent('食費'),'PUT',body,one.id));
  assert.equal(f.db.prepare('SELECT category FROM card_entries WHERE id=?').get(entry.id).category,'食費');
  const history=await json(await f.call('b','/settlement-history?month=2026-09','GET',undefined,one.id));assert.equal(history.months.at(-1).total,0);
 }finally{f.db.close();}
});

test('対象者・個別割合・月のスナップショット・競合を保存する',async()=>{
 const f=spaceFixture();try{
  const space=await create(f);await invite(f,space,'b');await invite(f,space,'c');
  await json(await f.call('owner','/bills','POST',{due_month:'2026-09',title:'家賃',kind:'rent',amount:100001},space.id),201);
  let state=await json(await f.call('b','/state?month=2026-09','GET',undefined,space.id));
  const split=config(percent(['owner',6000],['b',4000]));
  await json(await f.call('b',`/spaces/${space.id}/settlement`,'PUT',{month:'2026-09',scope:'month',revision:state.settlement.revision,config:split}));
  assert.equal((await f.call('c',`/spaces/${space.id}/settlement`,'PUT',{month:'2026-09',scope:'month',revision:state.settlement.revision,config:split})).status,409);
  await json(await f.call('owner',`/spaces/${space.id}/settlement`,'PUT',{month:'2026-10',scope:'default',revision:0,config:config(equal('owner','b','c'))}));
  state=await json(await f.call('c','/state?month=2026-09','GET',undefined,space.id));assert.deepEqual(state.settlement.config,split);
  const history=await json(await f.call('b','/settlement-history?month=2026-09','GET',undefined,space.id));assert.deepEqual(history.months.at(-1),{month:'2026-09',total:100001,amount:40000});
  const october=await json(await f.call('c',`/spaces/${space.id}/details?month=2026-10`));assert.equal(october.settlement.config.common.shares.length,3);
  assert.equal((await f.call('owner',`/spaces/${space.id}/settlement`,'PUT',{month:'2026-09',scope:'month',revision:2,config:config(equal('outsider'))})).status,400);
 }finally{f.db.close();}
});

test('同時編集の古い明細を拒否し、メンバー削除後のアクセスを遮断する',async()=>{
 const f=spaceFixture();try{
  const space=await create(f);await invite(f,space,'b');
  const card=await json(await f.call('owner','/cards','POST',{name:'カード'},space.id),201);
  const statement=await json(await f.call('owner','/statements','POST',{card_id:card.id,due_month:'2026-09',title:'明細',confirmed_total:1000,entries:[{spent_on:'',title:'利用',category:'食費',amount:1000}]},space.id),201);
  const state=await json(await f.call('b','/state?month=2026-09','GET',undefined,space.id));
  const edit={revision:0,entries:state.entries.map(e=>({id:e.id,category:'外食費',amount:1200}))};
  await json(await f.call('owner',`/statements/${statement.id}/entries`,'PUT',edit,space.id));
  assert.equal((await f.call('b',`/statements/${statement.id}/entries`,'PUT',{...edit,entries:edit.entries.map(e=>({...e,amount:1300}))},space.id)).status,409);
  assert.equal(f.db.prepare('SELECT amount FROM card_entries WHERE statement_id=?').get(statement.id).amount,1200);
  await json(await f.call('owner',`/spaces/${space.id}/members/b`,'DELETE'));
  assert.equal((await f.call('b','/state?month=2026-09','GET',undefined,space.id)).status,404);
  await json(await f.call('owner',`/spaces/${space.id}/space`,'DELETE'));
  assert.equal((await f.call('owner','/state?month=2026-09','GET',undefined,space.id)).status,404);
 }finally{f.db.close();}
});

test('同じ招待コードを同時に使った2人のうち1人だけが参加できる',async()=>{
 const f=spaceFixture();try{
  const space=await create(f),{code}=await json(await f.call('owner',`/spaces/${space.id}/invites`,'POST',{}),201);
  const results=await Promise.all(['b','c'].map(user=>f.call(user,'/spaces/join','POST',{code,space_id:space.id})));
  assert.equal(results.filter(r=>r.status===200).length,1);
  assert.ok(results.every(r=>[200,404,409].includes(r.status)));
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM space_members WHERE space_id=?').get(space.id).n,2);
 }finally{f.db.close();}
});

test('個人では精算除外の費目も支出合計に含まれ、共有への招待は作れない',async()=>{
 const f=spaceFixture();try{
  await f.call('owner','/spaces');const space='personal:owner';
  const card=await json(await f.call('owner','/cards','POST',{name:'個人カード'},space),201);
  await json(await f.call('owner','/statements','POST',{card_id:card.id,due_month:'2026-09',title:'支出',confirmed_total:1500,entries:[{spent_on:'',title:'買い物',category:'食費',amount:1500}]},space),201);
  await json(await f.call('owner','/category-settings/'+encodeURIComponent('食費'),'PUT',{icon:'utensils',color:'#b78d6a',include_in_settlement:false},space));
  const history=await json(await f.call('owner','/settlement-history?month=2026-09','GET',undefined,space));assert.equal(history.months.at(-1).total,1500);
  assert.equal((await f.call('owner',`/spaces/${space}/invites`,'POST',{})).status,403);
 }finally{f.db.close();}
});

test('家賃をオフにすると基本・個別家賃を集計から外し、再有効化で同じ金額と割合へ戻る',async()=>{
 const f=spaceFixture();try{
  const space=await create(f);await invite(f,space,'b');
  await json(await f.call('owner',`/spaces/${space.id}/settlement`,'PUT',{month:'2026-08',scope:'default',revision:0,config:config(equal('owner','b'))}));
  await json(await f.call('owner','/rent-rules/2026-08','PUT',{amount:100000},space.id));
  await json(await f.call('owner','/bills','POST',{due_month:'2026-09',title:'家賃',kind:'rent',amount:120000},space.id),201);
  await json(await f.call('owner','/bills','POST',{due_month:'2026-09',title:'電気',kind:'utilities',amount:3000},space.id),201);
  const card=await json(await f.call('owner','/cards','POST',{name:'生活費'},space.id),201);
  await json(await f.call('owner','/statements','POST',{card_id:card.id,due_month:'2026-09',title:'明細',confirmed_total:2000,entries:[{spent_on:'',title:'買い物',category:'食費',amount:2000}]},space.id),201);
  const read=async()=>json(await f.call('b','/state?month=2026-09','GET',undefined,space.id));
  const before=await read();assert.deepEqual(before.space_preferences,{rent_enabled:true,revision:0});
  for(const [enabled,revision,total] of [[false,0,5000],[true,1,125000]]){
   await json(await f.call('b',`/spaces/${space.id}/preferences`,'PUT',{rent_enabled:enabled,revision}));
   const state=await read(),items=settlementItems(state);
   assert.equal(items.some(i=>i.key==='rent'),enabled);
   assert.equal(items.reduce((n,i)=>n+i.amount,0),total);
   assert.deepEqual(state.bills,before.bills);assert.deepEqual(state.rent_rules,before.rent_rules);assert.deepEqual(state.settlement,before.settlement);
   assert.equal(settlementAmounts(items,state.settlement.config).b,total/2);
   const {months}=await json(await f.call('b','/settlement-history?month=2026-09','GET',undefined,space.id));
   assert.deepEqual(months.at(-1),{month:'2026-09',total,amount:total/2});
   assert.equal(months.at(-2).total,enabled?100000:0);
   const personal=await json(await f.call('owner','/state?month=2026-09','GET',undefined,'personal:owner'));
   assert.equal(personal.space_preferences.rent_enabled,true);
  }
 }finally{f.db.close();}
});

test('家賃の設定はスペースのメンバーだけが変更でき、古い版や不正な入力を拒否する',async()=>{
 const f=spaceFixture();try{
  const space=await create(f);await invite(f,space,'b');
  const path=`/spaces/${space.id}/preferences`;
  assert.equal((await f.call('outsider',path,'PUT',{rent_enabled:false,revision:0})).status,404);
  for(const body of [{rent_enabled:'false',revision:0},{rent_enabled:0,revision:0},{rent_enabled:false},{rent_enabled:false,revision:-1}])assert.equal((await f.call('b',path,'PUT',body)).status,400);
  const concurrent=await Promise.all(['owner','b'].map(user=>f.call(user,path,'PUT',{rent_enabled:false,revision:0})));
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  assert.equal((await f.call('owner',path,'PUT',{rent_enabled:true,revision:0})).status,409);
  const state=await json(await f.call('owner','/state?month=2026-09','GET',undefined,space.id));
  assert.deepEqual(state.space_preferences,{rent_enabled:false,revision:1});
  await json(await f.call('owner',`/spaces/${space.id}/members/b`,'DELETE'));
  assert.equal((await f.call('b',path,'PUT',{rent_enabled:true,revision:1})).status,404);
 }finally{f.db.close();}
});

test('個人の家賃も無効にでき、既存DBは新しい設定表を自動作成して従来どおり有効から始める',async()=>{
 const f=spaceFixture();try{
  await f.call('owner','/spaces');const space='personal:owner';
  f.db.exec('DROP TABLE space_preferences');
  await json(await f.call('owner','/rent-rules/2026-09','PUT',{amount:80000},space));
  const state=await json(await f.call('owner','/state?month=2026-09','GET',undefined,space));
  assert.deepEqual(state.space_preferences,{rent_enabled:true,revision:0});
  await json(await f.call('owner',`/spaces/${space}/preferences`,'PUT',{rent_enabled:false,revision:0}));
  const next=await json(await f.call('owner','/state?month=2026-09','GET',undefined,space));
  assert.equal(settlementItems(next,true).reduce((n,i)=>n+i.amount,0),0);
  const history=await json(await f.call('owner','/settlement-history?month=2026-09','GET',undefined,space));assert.equal(history.months.at(-1).total,0);
  const demo=await json(await f.call('owner','/state?month=2026-09&demo=1','GET',undefined,space));
  assert.equal(settlementItems(demo,true).some(i=>i.key==='rent'),true);
  assert.equal(f.db.prepare('SELECT rent_enabled FROM space_preferences WHERE space_id=?').get(space).rent_enabled,0);
 }finally{f.db.close();}
});

test('個人・共有のスペース名は作成者だけが変更でき、再取得しても保持する',async()=>{
 const f=spaceFixture();try{
  const shared=await create(f);await invite(f,shared,'b');
  for(const id of ['personal:owner',shared.id]){
   await json(await f.call('owner',`/spaces/${id}/name`,'PUT',{name:'わが家'}));
   const spaces=await json(await f.call('owner','/spaces'));assert.equal(spaces.spaces.find(s=>s.id===id).name,'わが家');
   assert.notEqual((await f.call('b',`/spaces/${id}/name`,'PUT',{name:'変更'})).status,200);
  }
 }finally{f.db.close();}
});


test('端数の対象者と調整額を計算結果から取得し、均等・割合・返金を説明できる',()=>{
 const detail=(amount,split)=>settlementDetails([{key:'rent',amount}],config(split));
 assert.deepEqual(detail(1001,equal('b','a')),{amounts:{b:500,a:501},adjustments:{a:1}});
 assert.deepEqual(detail(1000,equal('a','b')).adjustments,{});
 assert.deepEqual(detail(1001,equal('c','b','a')).adjustments,{a:1,b:1});
 assert.deepEqual(detail(101,percent(['a',5000],['b',3000],['c',2000])).adjustments,{a:1});
 assert.deepEqual(detail(-1001,equal('a','b')),{amounts:{a:-501,b:-500},adjustments:{a:-1}});
 assert.deepEqual(detail(0,equal('a','b')).adjustments,{});
 const items=[{key:'rent',amount:101},{key:'card:c',amount:101}];
 assert.deepEqual(settlementDetails(items,{...config(equal('a','b')),uniform:false}),{amounts:{a:102,b:100},adjustments:{a:2}});
 assert.deepEqual(settlementDetails(items,config(equal('a','b'))),{amounts:{a:101,b:101},adjustments:{}});
});
