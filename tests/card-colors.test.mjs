import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { cardColors, categoryColors } from '../src/card-colors.ts';
import app from '../dist/worker.mjs';

function fixture() {
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  const migrations=readdirSync(new URL('../migrations/',import.meta.url)).sort();
  for(const name of migrations.filter(name=>name<'0005'))db.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  db.exec("INSERT INTO shared_cards (id,name,active) VALUES ('existing','生活費',1)");
  for(const name of migrations.filter(name=>name>='0005'))db.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
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
  const call=(path,method='GET',body)=>app.fetch(new Request(`https://example.test/api${path}`,{method,headers:{Authorization:'Basic '+btoa('guest:test'),Origin:'https://example.test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{APP_PASSWORD:'test',APP_ENV:'staging',DB});
  return {db,call};
}

test('既存カードは黒で維持され、プリセット全18色の変更が保存・再取得できる',async()=>{
  const {db,call}=fixture();
  try {
    const getCard=async()=>((await (await call('/state?month=2026-09')).json()).cards[0]);
    assert.equal((await getCard()).color,'#171717');
    assert.equal(cardColors.length,18);
    for(const {value} of cardColors){
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
    assert.equal(before.category_settings.length,10);
    assert.deepEqual(before.category_settings.find(item=>item.category==='食費'),{category:'食費',icon:'basket',color:'#738778'});
    const icons=['basket','utensils','shopping','lightbulb','phone','train','home','heart','gamepad','tag','coffee','book','shirt','plane','gift','paw','car','bike','bus','fuel','parking','hotel','map','beach','water','flame','wifi','laptop','sofa','wrench','scissors','sparkles','pill','stethoscope','baby','graduation','music','film','dumbbell','wallet'];
    for(let index=0;index<Math.max(categoryColors.length,icons.length);index++){
      const value={icon:icons[index%icons.length],color:categoryColors[index%categoryColors.length].value};
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
    assert.equal(state.category_settings.length,11);
    assert.equal(state.category_settings.at(-1).category,'旅行費');
    assert.equal((await call('/category-settings/'+encodeURIComponent('旅行費'),'PUT',{icon:'gift',color:'#d05d8c'})).status,200);
    const imported=await call('/statements','POST',{due_month:'2026-09',card_id:'existing',title:'旅行',confirmed_total:1000,entries:[{spent_on:'2026-09-01',title:'乗車券',category:'旅行費',amount:1000}]});
    assert.equal(imported.status,201);
    const updated=await (await call('/state?month=2026-09')).json();
    const entry=updated.entries[0];
    assert.equal(entry.category,'旅行費');
    assert.equal((await call(`/statements/${entry.statement_id}/entries`,'PUT',{entries:[{id:entry.id,category:'旅行費',amount:1200}]})).status,200);
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
    assert.deepEqual(db.prepare('SELECT * FROM category_settings').all().map(row=>({...row})),[value]);
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
    assert.equal(state.statements[0].card_id,null);
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
    const response=await call('/statements/statement/entries','PUT',{entries:[{id:'first',category:'日用品費',amount:5000},{id:'second',category:'外食費',amount:-500}]});
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
      assert.equal((await call('/statements/statement/entries','PUT',{entries})).status,400);
    }
    const state=await (await call('/state?month=2026-09')).json();
    assert.equal(state.statements[0].confirmed_total,3000);
    assert.equal(state.entries.reduce((sum,row)=>sum+row.amount,0),3000);
  } finally {db.close();}
});
