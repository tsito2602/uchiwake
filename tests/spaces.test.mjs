import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spaceFixture } from './spaces-fixture.mjs';
const {outputFiles}=await build({entryPoints:[new URL('../src/spaces.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const {allocate,settlementDetails,settlementAmounts,settlementItems,validateConfig,prepareSettlementConfig}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const equal=(...ids)=>({mode:'equal',shares:ids.map(user_id=>({user_id,weight:1}))});
const percent=(...weights)=>({mode:'percent',shares:weights.map(([user_id,weight])=>({user_id,weight}))});
const config=(common,items={})=>({uniform:!Object.keys(items).length,common,items});
async function json(response,status=200){assert.equal(response.status,status,await response.clone().text());return response.json();}
async function create(f,user='owner'){await json(await f.call(user,'/spaces'));return (await json(await f.call(user,'/spaces','POST',{name:'ふたりの家計'}),201)).space;}
async function invite(f,space,user){const {code}=await json(await f.call('owner',`/spaces/${space.id}/invites`,'POST',{}),201);const preview=await json(await f.call(user,'/spaces/invite-preview','POST',{code}));await json(await f.call(user,'/spaces/join','POST',{code,space_id:preview.space_id}));return code;}

test('均等・割合・返金の端数は自動配分せず整数部分だけを負担する',()=>{
 assert.deepEqual(allocate(100,equal('a','b','c')),{a:33,b:33,c:33});
 assert.deepEqual(allocate(101,percent(['a',5000],['b',3000],['c',2000])),{a:50,b:30,c:20});
 assert.deepEqual(allocate(-101,percent(['a',5000],['b',3000],['c',2000])),{a:-50,b:-30,c:-20});
 for(let n=-200;n<200;n++){const d=settlementDetails([{key:'rent',amount:n}],config(equal('a','b','c')));assert.equal(Object.values(d.amounts).reduce((a,b)=>a+b,0)+d.unassigned,n);}
 const c=config(equal('a','b'),{rent:percent(['a',6000],['b',4000]),'card:c':equal('a','b','c')});
 assert.deepEqual(settlementAmounts([{key:'rent',amount:100000},{key:'card:c',amount:3000}],c),{a:61000,b:41000,c:1000});
 assert.deepEqual(settlementAmounts([{key:'rent',amount:100000},{key:'card:c',amount:3000}],{...c,uniform:true}),{a:51500,b:51500});
 assert.equal(validateConfig(config(percent(['a',5000],['b',4999])),new Set(['a','b'])),false);
 assert.equal(validateConfig(config(equal('a','a')),new Set(['a'])),false);
 assert.equal(validateConfig(config(equal('outsider')),new Set(['a'])),false);
});

test('個別設定の保存は表示中の割合と休止中の設定を保ち、非表示の共通設定で保存を妨げない',()=>{
 const ids=new Set(['a','b']);
 const items=[{key:'card:one',amount:3001},{key:'rent',amount:100001}];
 const original={uniform:false,common:percent(['a',6000],['b',4000]),items:{rent:equal('a'),'bill:paused':equal('b')}};
 const before=structuredClone(original);
 const saved=prepareSettlementConfig(original,items,ids);
 assert.deepEqual(saved.items['card:one'],original.common);
 assert.deepEqual(saved.items.rent,original.items.rent);
 assert.deepEqual(saved.items['bill:paused'],original.items['bill:paused']);
 assert.deepEqual(settlementAmounts(items,saved),settlementAmounts(items,original));
 assert.deepEqual(saved.common,original.common);
 assert.deepEqual(original,before);
 assert.equal(validateConfig(saved,ids),true);
 const former={...original,common:equal('a','former')};
 assert.equal(validateConfig(prepareSettlementConfig(former,items,ids),ids),false);
 const corrected={...former,items:{...former.items,'card:one':equal('b')}};
 const repaired=prepareSettlementConfig(corrected,items,ids);
 assert.equal(validateConfig(repaired,ids),true);
 assert.deepEqual(settlementAmounts(items,repaired),settlementAmounts(items,corrected));
 assert.deepEqual(repaired.common,equal('a','b'));
 const unfinished={...corrected,items:{...corrected.items,rent:percent(['a',9000])}};
 assert.equal(validateConfig(prepareSettlementConfig(unfinished,items,ids),ids),false);
 const uniform={...former,uniform:true};
 assert.strictEqual(prepareSettlementConfig(uniform,items,ids),uniform);
 assert.equal(validateConfig(uniform,ids),false);
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

test('個人・共有とも家賃は初期状態でオフになり、保存済みのオンは変更しない',async()=>{
 const f=spaceFixture();try{
  const shared=await create(f);
  for(const id of ['personal:owner',shared.id]){
   let state=await json(await f.call('owner','/state?month=2026-09','GET',undefined,id));
   assert.deepEqual(state.space_preferences,{rent_enabled:false,revision:0});
   assert.equal(settlementItems(state).some(item=>item.key==='rent'),false);
   await json(await f.call('owner',`/spaces/${id}/preferences`,'PUT',{rent_enabled:true,revision:0}));
   state=await json(await f.call('owner','/state?month=2026-09','GET',undefined,id));
   assert.deepEqual(state.space_preferences,{rent_enabled:true,revision:1});
  }
  const sharedAgain=await json(await f.call('owner','/state?month=2026-09','GET',undefined,shared.id));
  assert.equal(sharedAgain.space_preferences.rent_enabled,true);
  const {space_preferences,...missing}=sharedAgain;
  assert.equal(settlementItems(missing).some(item=>item.key==='rent'),false);
 }finally{f.db.close();}
});

test('削除の直前に別メンバーが保存しても、項目も明細合計も上書きしない',async()=>{
 const f=spaceFixture();try{
  const space=await create(f);
  const card=await json(await f.call('owner','/cards','POST',{name:'カード'},space.id),201);
  const statement=await json(await f.call('owner','/statements','POST',{card_id:card.id,due_month:'2026-09',title:'明細',confirmed_total:3000,entries:[{spent_on:'',title:'スーパー',category:'食費',amount:2000},{spent_on:'',title:'カフェ',category:'外食費',amount:1000}]},space.id),201);
  const entries=f.db.prepare('SELECT id,category,amount FROM card_entries WHERE statement_id=? ORDER BY amount DESC').all(statement.id);
  const batch=f.DB.batch;
  f.DB.batch=async statements=>{
   f.db.prepare('UPDATE card_entries SET amount=2500 WHERE id=?').run(entries[0].id);
   f.db.prepare('UPDATE card_statements SET confirmed_total=3500,revision=1 WHERE id=?').run(statement.id);
   return batch(statements);
  };
  assert.equal((await f.call('owner',`/statements/${statement.id}/entries`,'PUT',{revision:0,entries:[{...entries[0],amount:1500}],deleted_ids:[entries[1].id]},space.id)).status,409);
  const state=await json(await f.call('owner','/state?month=2026-09','GET',undefined,space.id));
  assert.equal(state.entries.length,2);
  assert.equal(state.entries.reduce((sum,entry)=>sum+entry.amount,0),3500);
  assert.equal(state.statements[0].confirmed_total,3500);
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

test('表示名の変更をメンバーと招待へ反映し、再読込でも名前と負担設定を保持する',async()=>{
 const f=spaceFixture();try{
  const space=await create(f);await invite(f,space,'b');
  f.db.prepare("UPDATE space_members SET name=''").run();
  await json(await f.call('owner','/auth/profile','PUT',{name:'変更した表示名'}));
  await json(await f.call('b','/auth/session'));
  const rules=f.db.prepare('SELECT * FROM settlement_rules ORDER BY space_id,month,scope').all();
  const {code}=await json(await f.call('owner',`/spaces/${space.id}/invites`,'POST',{}),201);
  const preview=await json(await f.call('c','/spaces/invite-preview','POST',{code}));
  assert.deepEqual(preview,{space_id:space.id,name:space.name,inviter:'変更した表示名'});
  const {user}=await json(await f.call('owner','/auth/session'));assert.equal(user.name,'変更した表示名');
  await json(await f.call('owner','/spaces'));
  assert.equal(f.db.prepare('SELECT display_name FROM user_profiles WHERE user_id=?').get('owner').display_name,'変更した表示名');
  assert.deepEqual(f.db.prepare('SELECT * FROM settlement_rules ORDER BY space_id,month,scope').all(),rules);
  await json(await f.call('c','/spaces/join','POST',{code,space_id:space.id}));
  await json(await f.call('owner',`/spaces/${space.id}/members/b`,'DELETE'));
  const {members}=await json(await f.call('owner',`/spaces/${space.id}/details?month=2026-09`));
  assert.deepEqual(members.map(m=>[m.user_id,m.name,m.active]),[['owner','変更した表示名',true],['b','b',false],['c','c',true]]);
  await json(await f.call('owner','/auth/profile','PUT',{name:'もう一度変更'}));
  const state=await json(await f.call('owner','/state?month=2026-09','GET',undefined,space.id));
  assert.equal(state.members.find(m=>m.user_id==='owner').name,'もう一度変更');
 }finally{f.db.close();}
});

test('未来の棒グラフに登録済みの支出を含め、未来の月を開いた合計と一致する',async()=>{
 const f=spaceFixture();try{
  await json(await f.call('owner','/spaces'));const space='personal:owner';
  const card=await json(await f.call('owner','/cards','POST',{name:'カード'},space),201);
  await json(await f.call('owner','/statements','POST',{card_id:card.id,due_month:'2026-12',title:'未来の引落',confirmed_total:3500,entries:[{spent_on:'',title:'利用',category:'食費',amount:3500}]},space),201);
  const {months}=await json(await f.call('owner','/settlement-history?month=2031-09&months=120','GET',undefined,space));
  assert.equal(months.length,120);assert.equal(months[0].month,'2021-10');assert.equal(months.at(-1).month,'2031-09');
  assert.deepEqual(months.find(m=>m.month==='2026-12'),{month:'2026-12',total:3500,amount:3500});
  const state=await json(await f.call('owner','/state?month=2026-12','GET',undefined,space));
  assert.equal(settlementItems(state,true).reduce((n,item)=>n+item.amount,0),3500);
  assert.deepEqual(months.find(m=>m.month==='2027-01'),{month:'2027-01',total:0,amount:0});
  for(const count of ['0','-1','121','100000','120x'])assert.equal((await f.call('owner',`/settlement-history?month=2031-09&months=${count}`,'GET',undefined,space)).status,400);
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
  await json(await f.call('owner',`/spaces/${space.id}/preferences`,'PUT',{rent_enabled:true,revision:0}));
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
  const before=await read();assert.deepEqual(before.space_preferences,{rent_enabled:false,revision:0});
  assert.equal(settlementItems(before).reduce((n,i)=>n+i.amount,0),5000);
  for(const [enabled,revision,total] of [[true,0,125000],[false,1,5000],[true,2,125000]]){
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
   assert.equal(personal.space_preferences.rent_enabled,false);
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

test('個人の家賃は設定表のない既存DBでも初期状態は無効で、有効化した設定は保持する',async()=>{
 const f=spaceFixture();try{
  await f.call('owner','/spaces');const space='personal:owner';
  f.db.exec('DROP TABLE space_preferences');
  await json(await f.call('owner','/rent-rules/2026-09','PUT',{amount:80000},space));
  const state=await json(await f.call('owner','/state?month=2026-09','GET',undefined,space));
  assert.deepEqual(state.space_preferences,{rent_enabled:false,revision:0});
  assert.equal(settlementItems(state,true).reduce((n,i)=>n+i.amount,0),0);
  await json(await f.call('owner',`/spaces/${space}/preferences`,'PUT',{rent_enabled:true,revision:0}));
  const next=await json(await f.call('owner','/state?month=2026-09','GET',undefined,space));
  assert.deepEqual(next.space_preferences,{rent_enabled:true,revision:1});
  assert.equal(settlementItems(next,true).reduce((n,i)=>n+i.amount,0),80000);
  const history=await json(await f.call('owner','/settlement-history?month=2026-09','GET',undefined,space));assert.equal(history.months.at(-1).total,80000);
  const demo=await json(await f.call('owner','/state?month=2026-09&demo=1','GET',undefined,space));
  assert.equal(settlementItems(demo,true).some(i=>i.key==='rent'),true);
  assert.equal(f.db.prepare('SELECT rent_enabled FROM space_preferences WHERE space_id=?').get(space).rent_enabled,1);
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


test('端数は未選択を維持し、明示した一人にだけ加減算する',()=>{
 const detail=(amount,split,user)=>settlementDetails([{key:'rent',amount}],{...config(split),roundingUserId:user});
 assert.deepEqual(detail(1001,equal('b','a')),{amounts:{b:500,a:500},adjustments:{},remainder:1,unassigned:1});
 assert.deepEqual(detail(1001,equal('b','a'),'b'),{amounts:{b:501,a:500},adjustments:{b:1},remainder:1,unassigned:0});
 assert.deepEqual(detail(1001,equal('b','a'),null),detail(1001,equal('b','a')));
 assert.equal(detail(1001,equal('b','a'),'outsider').unassigned,1);
 assert.deepEqual(detail(1000,equal('a','b')).adjustments,{});
 assert.equal(detail(1001,equal('c','b','a')).unassigned,2);
 assert.deepEqual(detail(101,percent(['a',5000],['b',3000],['c',2000]),'c').amounts,{a:50,b:30,c:21});
 assert.deepEqual(detail(-1001,equal('a','b'),'b'),{amounts:{a:-500,b:-501},adjustments:{b:-1},remainder:-1,unassigned:0});
 assert.deepEqual(detail(0,equal('a','b')).adjustments,{});
 const items=[{key:'rent',amount:101},{key:'card:c',amount:101}];
 assert.deepEqual(settlementDetails(items,{...config(equal('a','b')),uniform:false}),{amounts:{a:100,b:100},adjustments:{},remainder:2,unassigned:2});
 assert.deepEqual(settlementDetails(items,{...config(equal('a','b')),uniform:false,roundingUserId:'b'}),{amounts:{a:100,b:102},adjustments:{b:2},remainder:2,unassigned:0});
 assert.deepEqual(settlementDetails(items,config(equal('a','b'))),{amounts:{a:101,b:101},adjustments:{},remainder:0,unassigned:0});
 for(let n=-200;n<200;n++)for(const who of [null,'a','b','c']){
  const d=detail(n,percent(['a',3333],['b',3333],['c',3334]),who);
  assert.equal(Object.values(d.amounts).reduce((sum,value)=>sum+value,0)+d.unassigned,n);
 }
});

test('招待後の「この月以降」は保存済みの月と将来の設定に反映し、開始月より前は保つ',async()=>{
 const f=spaceFixture();try{
  const space=await create(f);
  for(const month of ['2026-07','2026-08','2026-09']){
   await json(await f.call('owner','/bills','POST',{due_month:month,title:'光熱費',kind:'utilities',amount:10000},space.id),201);
   await json(await f.call('owner',`/state?month=${month}`,'GET',undefined,space.id));
  }
  await json(await f.call('owner',`/spaces/${space.id}/settlement`,'PUT',{month:'2026-10',scope:'default',revision:0,config:config(equal('owner'))}));
  await invite(f,space,'b');
  const split=config(percent(['owner',6000],['b',4000]));
  await json(await f.call('b',`/spaces/${space.id}/settlement`,'PUT',{month:'2026-08',scope:'default',revision:0,config:split}));
  for(const month of ['2026-08','2026-09','2026-10','2026-11']){
   const state=await json(await f.call('b',`/state?month=${month}`,'GET',undefined,space.id));assert.deepEqual(state.settlement.config,split);
  }
  const july=await json(await f.call('b','/state?month=2026-07','GET',undefined,space.id));assert.deepEqual(july.settlement.config,config(equal('owner')));
  const history=await json(await f.call('b','/settlement-history?month=2026-09','GET',undefined,space.id));assert.deepEqual(history.months.slice(-3).map(m=>m.amount),[0,4000,4000]);
  const before=f.db.prepare('SELECT * FROM settlement_rules ORDER BY space_id,month,scope').all();
  assert.equal((await f.call('b',`/spaces/${space.id}/settlement`,'PUT',{month:'2026-08',scope:'default',revision:0,config:config(equal('b'))})).status,409);
  assert.deepEqual(f.db.prepare('SELECT * FROM settlement_rules ORDER BY space_id,month,scope').all(),before);
  // Propagation also invalidates an editor that read the old monthly snapshot.
  assert.equal((await f.call('owner',`/spaces/${space.id}/settlement`,'PUT',{month:'2026-09',scope:'month',revision:1,config:config(equal('owner'))})).status,409);
  await json(await f.call('owner',`/spaces/${space.id}/settlement`,'PUT',{month:'2026-08',scope:'default',revision:1,config:config(equal('owner','b'))}));
  const updated=await json(await f.call('b','/state?month=2026-09','GET',undefined,space.id));assert.deepEqual(updated.settlement.config,config(equal('owner','b')));
 }finally{f.db.close();}
});

test('過去の月だけの負担変更は前後の月と別スペースに影響しない',async()=>{
 const f=spaceFixture();try{
  const space=await create(f);await invite(f,space,'b');const other=await create(f);
  await json(await f.call('owner',`/spaces/${space.id}/settlement`,'PUT',{month:'2025-01',scope:'default',revision:0,config:config(equal('owner','b'))}));
  await json(await f.call('owner',`/spaces/${space.id}/settlement`,'PUT',{month:'2025-06',scope:'month',revision:0,config:config(percent(['owner',3000],['b',7000]))}));
  for(const month of ['2025-05','2025-07']){
   const state=await json(await f.call('b',`/state?month=${month}`,'GET',undefined,space.id));assert.deepEqual(state.settlement.config,config(equal('owner','b')));
  }
  const june=await json(await f.call('b','/state?month=2025-06','GET',undefined,space.id));assert.equal(june.settlement.config.common.shares[1].weight,7000);
  const otherState=await json(await f.call('owner','/state?month=2025-06','GET',undefined,other.id));assert.deepEqual(otherState.settlement.config,config(equal('owner')));
  assert.equal((await f.call('owner',`/spaces/${space.id}/settlement`,'PUT',{month:'2024-01',scope:'default',revision:99,config:config(equal('owner'))})).status,409);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM settlement_rules WHERE space_id=? AND month='2024-01'").get(space.id).n,0);
 }finally{f.db.close();}
});

test('端数の選択・解除を月別に共有し、履歴にも反映する。割合の変更では選択を流用しない',async()=>{
 const f=spaceFixture();try{
  const space=await create(f);await invite(f,space,'b');
  await json(await f.call('owner',`/spaces/${space.id}/settlement`,'PUT',{month:'2026-08',scope:'default',revision:0,config:config(equal('owner','b'))}));
  for(const month of ['2026-08','2026-09'])await json(await f.call('owner','/bills','POST',{due_month:month,title:'水道',kind:'utilities',amount:1001},space.id),201);
  const read=(user,month='2026-09')=>f.call(user,`/state?month=${month}`,'GET',undefined,space.id).then(json);
  const save=(user,user_id,revision,month='2026-09')=>f.call(user,`/spaces/${space.id}/rounding`,'PUT',{month,user_id,revision});
  let state=await read('owner');const revision=state.settlement.revision;
  assert.equal(settlementDetails(settlementItems(state),state.settlement.config).unassigned,1);
  await json(await save('b','b',revision));
  state=await read('owner');
  assert.equal(state.settlement.config.roundingUserId,'b');
  assert.equal(settlementAmounts(settlementItems(state),state.settlement.config).b,501);
  const history=await json(await f.call('b','/settlement-history?month=2026-09','GET',undefined,space.id));
  assert.equal(history.months.at(-1).amount,501);
  assert.equal(history.months.at(-2).amount,500);
  await json(await save('owner','owner',revision),409);
  await json(await save('outsider','outsider',state.settlement.revision),404);
  await json(await save('owner','outsider',state.settlement.revision),400);
  // Updating proportions preserves each month's independent selection, not the submitted field.
  await json(await f.call('owner',`/spaces/${space.id}/settlement`,'PUT',{month:'2026-09',scope:'month',revision:state.settlement.revision,config:{...config(equal('owner','b')),roundingUserId:'owner'}}));
  assert.equal((await read('owner')).settlement.config.roundingUserId,'b');
  await read('owner','2026-08');
  const defaults=await json(await f.call('owner',`/spaces/${space.id}/defaults?month=2026-08`));
  await json(await f.call('owner',`/spaces/${space.id}/settlement`,'PUT',{month:'2026-08',scope:'default',revision:defaults.revision,config:{...config(equal('owner','b')),roundingUserId:'owner'}}));
  state=await read('owner');assert.equal(state.settlement.config.roundingUserId,'b');
  assert.equal((await read('owner','2026-08')).settlement.config.roundingUserId??null,null);
  assert.equal((await read('owner','2026-10')).settlement.config.roundingUserId??null,null);
  await json(await save('b',null,state.settlement.revision));
  state=await read('owner');assert.equal(state.settlement.config.roundingUserId,null);
  assert.equal(settlementDetails(settlementItems(state),state.settlement.config).unassigned,1);
  const cleared=await json(await f.call('b','/settlement-history?month=2026-09','GET',undefined,space.id));
  assert.equal(cleared.months.at(-1).amount,500);
  state=await read('owner','2026-08');await json(await save('owner','owner',state.settlement.revision,'2026-08'));
  assert.equal((await read('b','2026-08')).settlement.config.roundingUserId,'owner');
  assert.equal((await read('b')).settlement.config.roundingUserId,null);
 }finally{f.db.close();}
});

test('端数の保存直前に別メンバーが設定を変えたら更新を拒否する',async()=>{
 const f=spaceFixture();try{
  const space=await create(f);await invite(f,space,'b');
  await json(await f.call('owner',`/spaces/${space.id}/settlement`,'PUT',{month:'2026-09',scope:'month',revision:0,config:config(equal('owner','b'))}));
  const state=await json(await f.call('owner','/state?month=2026-09','GET',undefined,space.id));
  const prepare=f.DB.prepare;let raced=false;
  f.DB.prepare=sql=>{
   if(!raced&&sql.includes("config=json_set(config,'$.roundingUserId',?)")){
    raced=true;f.db.prepare("UPDATE settlement_rules SET revision=revision+1 WHERE space_id=? AND scope='month'").run(space.id);
   }
   return prepare(sql);
  };
  await json(await f.call('owner',`/spaces/${space.id}/rounding`,'PUT',{month:'2026-09',user_id:'b',revision:state.settlement.revision}),409);
  const after=await json(await f.call('owner','/state?month=2026-09','GET',undefined,space.id));
  assert.equal(after.settlement.config.roundingUserId??null,null);
 }finally{f.db.close();}
});
