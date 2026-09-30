import { auth, authEnv } from './auth-fixture.mjs';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { cardColors, categoryColors, allPaletteColors } from '../src/card-colors.ts';
import app from '../dist/worker.mjs';

function fixture() {
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  const migrations=readdirSync(new URL('../migrations/',import.meta.url)).sort();
  for(const name of migrations.filter(name=>name<'0005'))db.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  db.exec("INSERT INTO shared_cards (id,name,active) VALUES ('existing','生活費',1)");
  for(const name of migrations.filter(name=>name>='0005'))db.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  db.exec("UPDATE spaces SET owner_id='google-test-id' WHERE id='legacy'; INSERT INTO space_members(space_id,user_id,name) VALUES ('legacy','google-test-id','本人'),('legacy','partner','相手')");
  db.prepare("INSERT INTO settlement_rules(space_id,month,scope,config) VALUES ('legacy','0000-01','default',?)").run(JSON.stringify({uniform:true,common:{mode:'equal',shares:[{user_id:'google-test-id',weight:1},{user_id:'partner',weight:1}]},items:{}}));
  const DB={prepare(sql){const statement=db.prepare(sql);const bound=(params=[])=>({
    bind(...values){return bound(values);},
    async all(){return {results:statement.all(...params)};},
    async first(){return statement.get(...params)??null;},
    async run(){return {success:true,meta:{changes:statement.run(...params).changes}};},
  });return bound();},async batch(statements){
    db.exec('BEGIN');
    try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results;}
    catch(error){db.exec('ROLLBACK');throw error;}
  }};
  const call=(path,method='GET',body)=>app.fetch(new Request(`https://example.test/api${path}`,{method,headers:{'X-Space-Id':'legacy',Cookie:auth,Origin:'https://example.test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{...authEnv,APP_ENV:'staging',DB});
  return {db,call};
}

test('共通24色と旧色を保存でき、既存カードの色を維持する',async()=>{
  const {db,call}=fixture();
  try {
    const getCard=async()=>((await (await call('/state?month=2026-09')).json()).cards[0]);
    assert.equal((await getCard()).color,'#171717');
    assert.equal(cardColors.length,24);
    assert.deepEqual(categoryColors,cardColors);
    assert.equal(new Set(cardColors.map(color=>color.value)).size,24);
    assert.equal(allPaletteColors.length,40);
    for(const {value} of allPaletteColors){
      assert.equal((await call('/cards/existing','PUT',{name:'生活費',active:true,color:value})).status,200);
      assert.equal((await getCard()).color,value);
    }
    assert.equal((await getCard()).name,'生活費');
  } finally {db.close();}
});

test('新規カードに色を保存し、旧クライアントの色なし更新でも色を維持する',async()=>{
  const {db,call}=fixture();
  try {
    const response=await call('/cards','POST',{name:'旅行',color:'#8b5fc7'});
    assert.equal(response.status,201);
    const card=await response.json();
    assert.equal((await call(`/cards/${card.id}`,'PUT',{name:'旅行用',active:false})).status,200);
    const state=await (await call('/state?month=2026-09')).json();
    assert.deepEqual(state.cards.find(item=>item.id===card.id),{id:card.id,name:'旅行用',active:false,color:'#8b5fc7'});
    const legacy=await (await call('/cards','POST',{name:'旧形式'})).json();
    assert.equal(legacy.color,'#171717');
  } finally {db.close();}
});

test('プリセット外や不正なカラーでは既存データを書き換えない',async()=>{
  const {db,call}=fixture();
  try {
    for(const color of ['#abcdef','red','url(https://example.test)',42,null]){
      assert.equal((await call('/cards/existing','PUT',{name:'変更',active:false,color})).status,400);
    }
    assert.equal((await call('/cards','POST',{name:'不正',color:'#abcdef'})).status,400);
    const state=await (await call('/state?month=2026-09')).json();
    assert.deepEqual(state.cards,[{id:'existing',name:'生活費',active:true,color:'#171717'}]);
  } finally {db.close();}
});

test('費目は初期表示を維持し、全アイコン・プリセットの変更を月をまたいで保存する',async()=>{
  const {db,call}=fixture();
  try {
    seedStatement(db);
    const before=await (await call('/state?month=2026-09')).json();
    assert.equal(before.category_settings.length,11);
    assert.deepEqual(before.category_settings.find(item=>item.category==='食費'),{category:'食費',icon:'basket',color:'#738778'});
    const icons=['basket','utensils','shopping','lightbulb','phone','train','home','heart','gamepad','tag','coffee','book','shirt','plane','gift','paw','car','bike','bus','fuel','parking','hotel','map','beach','water','flame','wifi','laptop','sofa','wrench','scissors','sparkles','pill','stethoscope','baby','graduation','music','film','dumbbell','wallet'];
    for(let index=0;index<Math.max(allPaletteColors.length,icons.length);index++){
      const value={icon:icons[index%icons.length],color:allPaletteColors[index%allPaletteColors.length].value};
      assert.equal((await call('/category-settings/'+encodeURIComponent('食費'),'PUT',value)).status,200);
      const state=await (await call('/state?month=2026-10')).json();
      assert.deepEqual(state.category_settings.find(item=>item.category==='食費'),{category:'食費',...value});
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM category_settings').get().n,1);
    const after=await (await call('/state?month=2026-09')).json();
    assert.deepEqual(after.entries,before.entries);
    assert.deepEqual(after.statements,before.statements);
    assert.deepEqual(after.category_settings.filter(item=>item.category!=='食費'),before.category_settings.filter(item=>item.category!=='食費'));
    assert.equal((await call('/category-settings/'+encodeURIComponent('食費'),'PUT',{icon:'basket',color:'#738778'})).status,200);
  } finally {db.close();}
});

test('費目設定は不正な名前・アイコン・カラーを保存せず、デモにも実設定を混ぜない',async()=>{
  const {db,call}=fixture();
  try {
    for(const value of [{icon:'script',color:'#171717'},{icon:'basket',color:'red'},{icon:'basket',color:null},{icon:42,color:'#171717'},{icon:'basket',color:'#abcdef'}]){
      assert.equal((await call('/category-settings/'+encodeURIComponent('食費'),'PUT',value)).status,400);
    }
    assert.equal((await call('/category-settings/'+encodeURIComponent('未知の費目'),'PUT',{icon:'basket',color:'#171717'})).status,400);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM category_settings').get().n,0);
    assert.equal((await call('/category-settings/'+encodeURIComponent('食費'),'PUT',{icon:'coffee',color:'#171717'})).status,200);
    const demo=await (await call('/state?month=2026-09&demo=1')).json();
    assert.deepEqual(demo.category_settings,[]);
  } finally {db.close();}
});

test('追加費目は再取得・アイコン色の編集・明細取り込み・費目変更に使える',async()=>{
  const {db,call}=fixture();
  try {
    const value={category:'  旅行費  ',icon:'plane',color:'#3675d5'};
    const created=await call('/category-settings','POST',value);
    assert.equal(created.status,201);
    assert.deepEqual(await created.json(),{...value,category:'旅行費'});
    const state=await (await call('/state?month=2026-09')).json();
    assert.equal(state.category_settings.length,12);
    assert.equal(state.category_settings.at(-1).category,'旅行費');
    assert.equal((await call('/category-settings/'+encodeURIComponent('旅行費'),'PUT',{icon:'gift',color:'#d05d8c'})).status,200);
    const imported=await call('/statements','POST',{due_month:'2026-09',card_id:'existing',title:'旅行',confirmed_total:1000,entries:[{spent_on:'2026-09-01',title:'乗車券',category:'旅行費',amount:1000}]});
    assert.equal(imported.status,201);
    const updated=await (await call('/state?month=2026-09')).json();
    const entry=updated.entries[0];
    assert.equal(entry.category,'旅行費');
    assert.equal((await call(`/statements/${entry.statement_id}/entries`,'PUT',{revision:0,entries:[{id:entry.id,category:'旅行費',amount:1200}]})).status,200);
    assert.equal((await call(`/card-entries/${entry.id}/category`,'PUT',{category:'旅行費'})).status,200);
    assert.equal((await call(`/card-entries/${entry.id}/category`,'PUT',{category:'未登録の費目'})).status,400);
    assert.equal((await (await call('/state?month=2026-09')).json()).statements[0].confirmed_total,1200);
  } finally {db.close();}
});

test('追加費目の重複や不正な名前を拒否し、元の設定を上書きしない',async()=>{
  const {db,call}=fixture();
  try {
    const value={category:'旅行費',icon:'plane',color:'#3675d5'};
    assert.equal((await call('/category-settings','POST',value)).status,201);
    for(const category of ['旅行費','  旅行費  ','食費','', '  ', 'a'.repeat(31), '旅行\n費',null,42]){
      assert.equal((await call('/category-settings','POST',{...value,category,icon:'gift'})).status,400);
    }
    assert.equal((await call('/category-settings','POST',{...value,category:'不正',icon:'no-icon'})).status,400);
    assert.equal((await call('/category-settings','POST',{...value,category:'不正',color:'red'})).status,400);
    assert.deepEqual(db.prepare('SELECT category,icon,color FROM category_settings').all().map(row=>({...row})),[value]);
    const demo=await (await call('/state?month=2026-09&demo=1')).json();
    assert.equal(demo.category_settings.length,0);
  } finally {db.close();}
});

function seedStatement(db) {
  db.exec("INSERT INTO card_statements (id,card_id,due_month,title,confirmed_total) VALUES ('statement','existing','2026-09','生活費カード',3000)");
  db.exec("INSERT INTO card_entries (id,statement_id,title,category,amount) VALUES ('first','statement','スーパー','食費',2000),('second','statement','カフェ','外食費',1000)");
}

test('カード削除では登録済みの明細・利用行・金額を残す',async()=>{
  const {db,call}=fixture();
  try {
    seedStatement(db);
    assert.equal((await call('/cards/existing','DELETE')).status,200);
    const state=await (await call('/state?month=2026-09')).json();
    assert.equal(state.cards.length,0);
    assert.equal(state.statements[0].card_id,'existing');
    assert.equal(state.statements[0].confirmed_total,3000);
    assert.equal(state.entries.length,2);
    assert.equal(state.entries.reduce((sum,row)=>sum+row.amount,0),3000);
    assert.equal((await call('/cards/existing','DELETE')).status,404);
  } finally {db.close();}
});

test('費目と金額をまとめて保存し、返金を含むカード合計も更新する',async()=>{
  const {db,call}=fixture();
  try {
    seedStatement(db);
    const response=await call('/statements/statement/entries','PUT',{revision:0,entries:[{id:'first',category:'日用品費',amount:5000},{id:'second',category:'外食費',amount:-500}]});
    assert.equal(response.status,200);
    assert.equal((await response.json()).confirmed_total,4500);
    const state=await (await call('/state?month=2026-09')).json();
    assert.equal(state.statements[0].confirmed_total,4500);
    assert.equal(state.entries.find(row=>row.id==='first').category,'日用品費');
    assert.equal(state.entries.reduce((sum,row)=>sum+row.amount,0),4500);
  } finally {db.close();}
});

test('不正な金額・重複ID・別明細の行・行の不足は保存しない',async()=>{
  const {db,call}=fixture();
  try {
    seedStatement(db);
    const first={id:'first',category:'食費',amount:2000},second={id:'second',category:'外食費',amount:1000};
    for(const entries of [[first],[first,first],[first,{...second,id:'other'}],[first,{...second,amount:0}],[first,{...second,amount:1.5}],[first,{...second,amount:-3000}],[first,{...second,amount:100_000_001}],[first,{...second,category:'invalid'}]]) {
      assert.equal((await call('/statements/statement/entries','PUT',{revision:0,entries})).status,400);
    }
    const state=await (await call('/state?month=2026-09')).json();
    assert.equal(state.statements[0].confirmed_total,3000);
    assert.equal(state.entries.reduce((sum,row)=>sum+row.amount,0),3000);
  } finally {db.close();}
});

test('項目の削除と費目・金額変更を一括保存し、全項目を削除した明細は残さない',async()=>{
  const {db,call}=fixture();
  try {
    seedStatement(db);
    const response=await call('/statements/statement/entries','PUT',{revision:0,entries:[{id:'first',category:'日用品費',amount:2500}],deleted_ids:['second']});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true,confirmed_total:2500,deleted:false});
    let state=await (await call('/state?month=2026-09')).json();
    assert.equal(state.entries.length,1);
    assert.equal(state.entries[0].category,'日用品費');
    assert.equal(state.entries[0].amount,2500);
    assert.equal(state.statements[0].confirmed_total,2500);
    assert.equal(state.statements[0].revision,1);
    const history=await (await call('/settlement-history?month=2026-09')).json();
    assert.equal(history.months.at(-1).total,2500);
    assert.equal((await call('/statements/statement/entries','PUT',{revision:1,entries:[],deleted_ids:['first']})).status,200);
    state=await (await call('/state?month=2026-09')).json();
    assert.equal(state.entries.length,0);assert.equal(state.statements.length,0);
  } finally {db.close();}
});

test('削除IDの重複・別明細・別スペース・編集との重複・不正な合計を拒否する',async()=>{
  const {db,call}=fixture();
  try {
    seedStatement(db);
    db.exec("INSERT INTO card_statements(id,due_month,title,confirmed_total) VALUES ('other','2026-09','別明細',900)");
    db.exec("INSERT INTO card_entries(id,statement_id,title,category,amount) VALUES ('other-entry','other','他の利用','食費',900)");
    const first={id:'first',category:'食費',amount:2000};
    for(const deleted_ids of [['second','second'],['first'],['other-entry'],['missing'],[42],'second',null]){
      assert.equal((await call('/statements/statement/entries','PUT',{revision:0,entries:[first],deleted_ids})).status,400);
    }
    for(const entries of [[],[{...first,amount:-1}],[{...first,amount:0}],[{...first,amount:100_000_001}]]){
      assert.equal((await call('/statements/statement/entries','PUT',{revision:0,entries,deleted_ids:['second']})).status,400);
    }
    db.exec("INSERT INTO spaces(id,name,kind,owner_id) VALUES ('private','個人','personal','other'); UPDATE card_statements SET space_id='private' WHERE id='other'; UPDATE card_entries SET space_id='private' WHERE id='other-entry'");
    assert.equal((await call('/statements/other/entries','PUT',{revision:0,entries:[],deleted_ids:['other-entry']})).status,404);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_entries').get().n,3);
    assert.equal(db.prepare("SELECT confirmed_total FROM card_statements WHERE id='statement'").get().confirmed_total,3000);
  } finally {db.close();}
});

test('削除を含む保存は古い版を拒否し、DBエラー時は削除も金額も巻き戻す',async()=>{
  const {db,call}=fixture();
  try {
    seedStatement(db);
    const edit={revision:0,entries:[{id:'first',category:'日用品費',amount:2500}],deleted_ids:['second']};
    db.exec("UPDATE card_statements SET revision=1 WHERE id='statement'");
    assert.equal((await call('/statements/statement/entries','PUT',edit)).status,409);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_entries').get().n,2);
    db.exec("CREATE TRIGGER fail_statement_update BEFORE UPDATE ON card_statements BEGIN SELECT RAISE(ABORT,'test transaction rollback'); END");
    const original=console.error;console.error=()=>{};
    try {assert.equal((await call('/statements/statement/entries','PUT',{...edit,revision:1})).status,500);} finally {console.error=original;}
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_entries').get().n,2);
    assert.equal(db.prepare("SELECT amount FROM card_entries WHERE id='first'").get().amount,2000);
    assert.equal(db.prepare("SELECT confirmed_total FROM card_statements WHERE id='statement'").get().confirmed_total,3000);
  } finally {db.close();}
});

test('費目名の変更は全月の明細へ反映し、元の標準費目を再出現させない',async()=>{
 const {db,call}=fixture();
 try {
  seedStatement(db);
  db.exec("INSERT INTO card_statements (id,card_id,due_month,title,confirmed_total) VALUES ('past','existing','2026-08','前月',500)");
  db.exec("INSERT INTO card_entries (id,statement_id,title,category,amount) VALUES ('past-entry','past','スーパー','食費',500)");
  const change={category:'食料品',icon:'basket',color:'#738778',include_in_settlement:false};
  assert.equal((await call('/category-settings/'+encodeURIComponent('食費'),'PUT',change)).status,200);
  for(const month of ['2026-08','2026-09']){
   const state=await (await call('/state?month='+month)).json();
   assert.equal(state.category_settings.length,11);
   assert.ok(!state.category_settings.some(item=>item.category==='食費'));
   assert.deepEqual(state.category_settings.find(item=>item.category==='食料品'),{...change,original_category:'食費'});
   assert.ok(state.entries.some(item=>item.category==='食料品'));
   assert.ok(!state.entries.some(item=>item.category==='食費'));
  }
  assert.equal((await call('/category-settings/'+encodeURIComponent('食料品'),'PUT',{...change,category:'食品'})).status,200);
  const settings=(await (await call('/state?month=2026-09')).json()).category_settings;
  assert.equal(settings.find(item=>item.category==='食品').original_category,'食費');
  assert.ok(!settings.some(item=>item.category==='食料品'||item.category==='食費'));
  assert.equal(db.prepare("SELECT confirmed_total FROM card_statements WHERE id='statement'").get().confirmed_total,3000);
 } finally {db.close();}
});

test('重複名や不正な精算設定では設定・明細の名前を変更しない',async()=>{
 const {db,call}=fixture();
 try {
  seedStatement(db);
  for(const change of [{category:'外食費'},{category:''},{category:'名前',include_in_settlement:'false'}]){
   assert.equal((await call('/category-settings/'+encodeURIComponent('食費'),'PUT',{icon:'basket',color:'#738778',...change})).status,400);
  }
  assert.equal(db.prepare("SELECT category FROM card_entries WHERE id='first'").get().category,'食費');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM category_settings').get().n,0);
 } finally {db.close();}
});

test('精算除外は返金込みの対象費目だけを全月の履歴から差し引き、引落額と明細は維持する',async()=>{
 const {db,call}=fixture();
 try {
  seedStatement(db);
  db.exec("INSERT INTO card_entries (id,statement_id,title,category,amount) VALUES ('refund','statement','返金','外食費',-200)");
  db.exec("UPDATE card_statements SET confirmed_total=2800 WHERE id='statement'");
  db.exec("INSERT INTO rent_rules (space_id,effective_month,amount) VALUES ('legacy','2026-08',100000)");
  assert.equal((await call('/spaces/legacy/preferences','PUT',{rent_enabled:true,revision:0})).status,200);
  const setting={icon:'utensils',color:'#b78d6a',include_in_settlement:false};
  assert.equal((await call('/category-settings/'+encodeURIComponent('外食費'),'PUT',setting)).status,200);
  const getHistory=async()=> (await (await call('/settlement-history?month=2026-09')).json()).months.at(-1);
  assert.deepEqual(await getHistory(),{month:'2026-09',total:102000,amount:51000});
  const state=await (await call('/state?month=2026-09')).json();
  assert.equal(state.statements[0].confirmed_total,2800);
  assert.equal(state.entries.length,3);
  assert.equal((await call('/category-settings/'+encodeURIComponent('外食費'),'PUT',{...setting,include_in_settlement:true})).status,200);
  assert.deepEqual(await getHistory(),{month:'2026-09',total:102800,amount:51400});
 } finally {db.close();}
});

test('要確認はAPIでも保存を拒否し、その他への解決後は保存できる',async()=>{
 const {db,call}=fixture();
 try {
  const body={due_month:'2026-09',card_id:'existing',title:'取り込み',confirmed_total:1000,entries:[{spent_on:'2026-08-01',title:'不明な利用',category:'要確認',amount:1000}]};
  const rejected=await call('/statements','POST',body);
  assert.equal(rejected.status,400);
  assert.match((await rejected.json()).error,/要確認/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_statements').get().n,0);
  // Renaming the system bucket must not bypass its unresolved meaning.
  assert.equal((await call('/category-settings/'+encodeURIComponent('要確認'),'PUT',{category:'確認待ち',icon:'tag',color:'#171717'})).status,200);
  body.entries[0].category='確認待ち';
  assert.equal((await call('/statements','POST',body)).status,400);
  body.entries[0].category='その他';
  assert.equal((await call('/statements','POST',body)).status,201);
 } finally {db.close();}
});

test('旧その他・要確認の移行では行と金額を保持して要確認へ移す',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  for(const name of readdirSync(new URL('../migrations/',import.meta.url)).sort().filter(name=>name<'0008'))db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  db.exec("INSERT INTO card_statements (id,due_month,title,confirmed_total) VALUES ('old','2026-09','旧明細',1234)");
  db.exec("INSERT INTO card_entries (id,statement_id,title,category,amount) VALUES ('old-entry','old','不明','その他・要確認',1234)");
  db.exec("INSERT INTO category_settings (category,icon,color,include_in_settlement) VALUES ('その他・要確認','tag','#171717',0)");
  db.exec(readFileSync(new URL('../migrations/0008_review_category.sql',import.meta.url),'utf8'));
  const entry=db.prepare("SELECT category,amount FROM card_entries WHERE id='old-entry'").get();
  assert.equal(entry.category,'要確認');assert.equal(entry.amount,1234);
  const setting=db.prepare("SELECT include_in_settlement FROM category_settings WHERE category='要確認'").get();
  assert.equal(setting.include_in_settlement,0);
 } finally {db.close();}
});
