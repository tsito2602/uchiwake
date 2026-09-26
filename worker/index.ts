import { ImportError, upstreamImportError, logImportFailure, incompleteImportError } from './import-errors';
import { abortable, idleWatch } from '../src/streaming/idle';
import { readCategorySettings, categorySchemaReady } from './category-settings';
import { statementStream } from './statement-stream';
import { Hono } from 'hono';
import { billKinds, categories, type BillKind } from '../src/domain';
import { allCategoryAppearances, fallbackCategory, otherCategory, isReviewCategory, normalizeCategoryName, validCategoryName, validCategoryColor, validCategoryIcon } from '../src/category-appearance';
import { embeddedAssets } from './generated-assets';
import { defaultCardColor, validCardColor } from '../src/card-colors';
import { demoHistory, demoState } from './demo-data';

type Bindings = { DB: D1Database; APP_ENV: string; APP_PASSWORD?: string; OPENAI_API_KEY?: string };
const AI_MODEL='gpt-6-luna';
const app = new Hono<{ Bindings: Bindings }>();
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const error = (message: string, status: 400 | 401 | 404 | 413 | 500 | 502 | 503 = 400) => Response.json({ error: message }, { status });
const safeString = (v: unknown, max = 100) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const validAmount = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 100_000_000;
async function categoryNames(db:D1Database):Promise<string[]> {
  return allCategoryAppearances(await readCategorySettings(db)).map(item=>item.category);
}

// Protect the SPA and API alike, including any unknown asset path.
app.use('*', async (c, next) => {
  const password = c.env.APP_PASSWORD;
  if (!password) return error('認証設定がありません', 503);
  const auth = c.req.header('Authorization') || '';
  let supplied = '';
  if (auth.startsWith('Basic ')) {
    try { supplied = atob(auth.slice(6)).split(':').slice(1).join(':'); } catch { /* invalid header */ }
  }
  const expectedBytes = new TextEncoder().encode(password);
  const actualBytes = new TextEncoder().encode(supplied);
  const [expectedHash, actualHash] = await Promise.all([crypto.subtle.digest('SHA-256',expectedBytes),crypto.subtle.digest('SHA-256',actualBytes)]);
  let mismatch = 0;
  const a=new Uint8Array(expectedHash),b=new Uint8Array(actualHash);
  for (let i=0;i<a.length;i++) mismatch |= a[i]^b[i];
  if (mismatch !== 0) {
    return new Response('uchiwake のパスワードを入力してください', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="uchiwake staging", charset="UTF-8"', 'Cache-Control': 'no-store' } });
  }
  if (!['GET','HEAD','OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    if (origin && origin !== new URL(c.req.url).origin) return error('この画面から操作してください',401);
    if (['POST','PUT','PATCH'].includes(c.req.method) && !c.req.header('Content-Type')?.startsWith('application/json')) return error('JSONで送信してください');
  }
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options','nosniff');
  c.header('Referrer-Policy','no-referrer');
  c.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
});

app.get('/api/state', async c => {
  const month = c.req.query('month') || '';
  if (!monthPattern.test(month)) return error('月を確認してください');
  if(c.req.query('demo')==='1')return c.env.APP_ENV==='staging'?c.json({...demoState(month),ai_enabled:Boolean(c.env.OPENAI_API_KEY)}):error('見つかりません',404);
  const [bills, statements, entries, cards, rentRules, categorySettings] = await Promise.all([
    c.env.DB.prepare('SELECT id,due_month,title,kind,amount,note FROM bills WHERE due_month = ? ORDER BY created_at DESC').bind(month).all(),
    c.env.DB.prepare('SELECT id,card_id,due_month,title,confirmed_total,created_at FROM card_statements WHERE due_month = ? ORDER BY created_at DESC').bind(month).all(),
    c.env.DB.prepare('SELECT e.id,e.statement_id,e.spent_on,e.title,e.category,e.amount FROM card_entries e JOIN card_statements s ON s.id=e.statement_id WHERE s.due_month = ? ORDER BY s.created_at DESC,e.created_at,e.rowid').bind(month).all(),
    c.env.DB.prepare('SELECT id,name,active,color FROM shared_cards ORDER BY created_at,id').all(),
    c.env.DB.prepare('SELECT effective_month,amount FROM rent_rules ORDER BY effective_month DESC').all(),
    readCategorySettings(c.env.DB)
  ]);
  return c.json({ month, bills: bills.results, statements:statements.results, entries:entries.results, cards:cards.results.map(card=>({...card,active:Boolean(card.active)})), rent_rules:rentRules.results, category_settings:allCategoryAppearances(categorySettings), ai_enabled: Boolean(c.env.OPENAI_API_KEY), demo_enabled: c.env.APP_ENV === 'staging' });
});

app.post('/api/category-settings', async c => {
  const body=await c.req.json().catch(()=>null);
  if(!body||!validCategoryName(body.category))return error('費目名を1〜30文字で入力してください');
  const category=normalizeCategoryName(body.category);
  if(!validCategoryIcon(body.icon)||!validCategoryColor(category,body.color))return error('アイコンとカラーを確認してください');
  if(body.include_in_settlement!==undefined&&typeof body.include_in_settlement!=='boolean')return error('精算の設定を確認してください');
  const settings=await readCategorySettings(c.env.DB);
  if(allCategoryAppearances(settings).some(item=>item.category===category||item.original_category===category)||category==='その他・要確認')return error('同じ名前の費目があります');
  const included=body.include_in_settlement!==false;
  const ready=await categorySchemaReady(c.env.DB);
  if(!ready&&!included)return error('費目設定のDB更新が必要です。ステージングのマイグレーションを適用してください',503);
  const result=ready?
    await c.env.DB.prepare('INSERT INTO category_settings (category,icon,color,include_in_settlement) VALUES (?,?,?,?) ON CONFLICT(category) DO NOTHING').bind(category,body.icon,body.color,included?1:0).run():
    await c.env.DB.prepare('INSERT INTO category_settings (category,icon,color) VALUES (?,?,?) ON CONFLICT(category) DO NOTHING').bind(category,body.icon,body.color).run();
  if(!result.meta.changes)return error('同じ名前の費目があります');
  return c.json({category,icon:body.icon,color:body.color,...(!included?{include_in_settlement:false}:{})},201);
});

app.put('/api/category-settings/:category', async c => {
  const settings=allCategoryAppearances(await readCategorySettings(c.env.DB));
  const saved=settings.find(item=>item.category===c.req.param('category'));
  if(!saved)return error('費目を確認してください');
  const body=await c.req.json().catch(()=>null);
  if(!body||!validCategoryName(body.category??saved.category))return error('費目名を1〜30文字で入力してください');
  const category=normalizeCategoryName(body.category??saved.category);
  if(!validCategoryIcon(body.icon)||!validCategoryColor(category,body.color))return error('アイコンとカラーを確認してください');
  if(body.include_in_settlement!==undefined&&typeof body.include_in_settlement!=='boolean')return error('精算の設定を確認してください');
  if(category==='その他・要確認'||settings.some(item=>item.category!==saved.category&&(item.category===category||item.original_category===category)))return error('同じ名前の費目があります');
  const included=body.include_in_settlement??(saved.include_in_settlement!==false);
  const original=saved.original_category??(category!==saved.category&&(categories as readonly string[]).includes(saved.category)?saved.category:undefined);
  const ready=await categorySchemaReady(c.env.DB);
  if(!ready&&(category!==saved.category||!included))return error('費目設定のDB更新が必要です。ステージングのマイグレーションを適用してください',503);
  if(ready){
    // D1 batch is atomic: update both the setting key and every historical entry.
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO category_settings (category,icon,color) VALUES (?,?,?) ON CONFLICT(category) DO NOTHING').bind(saved.category,body.icon,body.color),
      c.env.DB.prepare('UPDATE category_settings SET category=?,icon=?,color=?,original_category=?,include_in_settlement=? WHERE category=?').bind(category,body.icon,body.color,original??null,included?1:0,saved.category),
      c.env.DB.prepare('UPDATE card_entries SET category=? WHERE category=?').bind(category,saved.category)
    ]);
  }else{
    await c.env.DB.prepare('INSERT INTO category_settings (category,icon,color) VALUES (?,?,?) ON CONFLICT(category) DO UPDATE SET icon=excluded.icon,color=excluded.color').bind(category,body.icon,body.color).run();
  }
  return c.json({category,icon:body.icon,color:body.color,...(original?{original_category:original}:{}),...(!included?{include_in_settlement:false}:{})});
});

app.get('/api/settlement-history', async c => {
  const month=c.req.query('month')||'';
  if (!monthPattern.test(month)) return error('月を確認してください');
  if(c.req.query('demo')==='1')return c.env.APP_ENV==='staging'?c.json({months:demoHistory(month)}):error('見つかりません',404);
  const [year,value]=month.split('-').map(Number);
  const start=new Date(Date.UTC(year,value-60,1)).toISOString().slice(0,7);
  const [bills,statements,rentRules,rentOverrides]=await Promise.all([
    c.env.DB.prepare("SELECT due_month AS month,SUM(amount) AS amount FROM bills WHERE kind NOT IN ('card','rent') AND due_month BETWEEN ? AND ? GROUP BY due_month").bind(start,month).all<{month:string;amount:number}>(),
    c.env.DB.prepare('SELECT due_month AS month,SUM(confirmed_total) AS amount FROM card_statements WHERE due_month BETWEEN ? AND ? GROUP BY due_month').bind(start,month).all<{month:string;amount:number}>(),
    c.env.DB.prepare('SELECT effective_month,amount FROM rent_rules WHERE effective_month <= ? ORDER BY effective_month DESC').bind(month).all<{effective_month:string;amount:number}>(),
    c.env.DB.prepare("SELECT due_month AS month,SUM(amount) AS amount FROM bills WHERE kind = 'rent' AND due_month BETWEEN ? AND ? GROUP BY due_month").bind(start,month).all<{month:string;amount:number}>()
  ]);
  const amounts=new Map<string,number>();
  for(const item of [...bills.results,...statements.results]) amounts.set(item.month,(amounts.get(item.month)||0)+item.amount);
  const excluded=(await readCategorySettings(c.env.DB)).filter(item=>item.include_in_settlement===false).map(item=>item.category);
  if(excluded.length){
    const rows=await c.env.DB.prepare(`SELECT s.due_month AS month,SUM(e.amount) AS amount FROM card_entries e JOIN card_statements s ON s.id=e.statement_id WHERE s.due_month BETWEEN ? AND ? AND e.category IN (${excluded.map(()=>'?').join(',')}) GROUP BY s.due_month`).bind(start,month,...excluded).all<{month:string;amount:number}>();
    for(const row of rows.results)amounts.set(row.month,(amounts.get(row.month)||0)-row.amount);
  }
  const overrides=new Map(rentOverrides.results.map(item=>[item.month,item.amount]));
  return c.json({months:Array.from({length:60},(_,index)=>{
    const key=new Date(Date.UTC(year,value-60+index,1)).toISOString().slice(0,7);
    const rent=overrides.get(key)??rentRules.results.find(rule=>rule.effective_month<=key)?.amount??0;
    const total=(amounts.get(key)||0)+rent;
    return {month:key,amount:Math.ceil(total/2),total};
  })});
});

app.post('/api/cards', async c => {
  const body=await c.req.json().catch(()=>null) as {name?:unknown;color?:unknown}|null;
  const name=safeString(body?.name,40);
  if (!name) return error('カード名を入力してください');
  const color=body?.color??defaultCardColor;
  if(!validCardColor(color))return error('カードのカラーを確認してください');
  const card={id:crypto.randomUUID(),name,active:true,color};
  await c.env.DB.prepare('INSERT INTO shared_cards (id,name,active,color) VALUES (?,?,1,?)').bind(card.id,card.name,card.color).run();
  return c.json(card,201);
});

app.put('/api/cards/:id', async c => {
  const body=await c.req.json().catch(()=>null) as {name?:unknown;active?:unknown;color?:unknown}|null;
  const name=safeString(body?.name,40);
  if (!name || typeof body?.active!=='boolean') return error('カード設定を確認してください');
  if(body.color!==undefined&&!validCardColor(body.color))return error('カードのカラーを確認してください');
  const result=await c.env.DB.prepare('UPDATE shared_cards SET name=?,active=?,color=COALESCE(?,color) WHERE id=?').bind(name,body.active?1:0,body.color??null,c.req.param('id')).run();
  return result.meta.changes ? c.json({ok:true}) : error('カードが見つかりません',404);
});

app.delete('/api/cards/:id', async c => {
  const id=c.req.param('id');
  const results=await c.env.DB.batch([
    c.env.DB.prepare('UPDATE card_statements SET card_id=NULL WHERE card_id=?').bind(id),
    c.env.DB.prepare('DELETE FROM shared_cards WHERE id=?').bind(id)
  ]);
  return results[1].meta.changes ? c.json({ok:true}) : error('カードが見つかりません',404);
});

app.put('/api/rent-rules/:month', async c => {
  const month=c.req.param('month');
  const body=await c.req.json().catch(()=>null) as {amount?:unknown}|null;
  if (!monthPattern.test(month) || !validAmount(body?.amount)) return error('基本家賃の月と金額を確認してください');
  await c.env.DB.prepare('INSERT INTO rent_rules (effective_month,amount) VALUES (?,?) ON CONFLICT(effective_month) DO UPDATE SET amount=excluded.amount').bind(month,body!.amount).run();
  return c.json({effective_month:month,amount:body!.amount});
});

app.delete('/api/rent-rules/:month', async c => {
  const month=c.req.param('month');
  if (!monthPattern.test(month)) return error('月を確認してください');
  const result=await c.env.DB.prepare('DELETE FROM rent_rules WHERE effective_month=?').bind(month).run();
  return result.meta.changes ? c.json({ok:true}) : error('設定が見つかりません',404);
});

app.post('/api/bills', async c => {
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !monthPattern.test(String(body.due_month)) || typeof body.kind !== 'string' || !(body.kind in billKinds) || !safeString(body.title) || !validAmount(body.amount)) return error('引落予定の入力を確認してください');
  const bill = { id: crypto.randomUUID(), due_month: String(body.due_month), title: safeString(body.title), kind: body.kind as BillKind, amount: Number(body.amount), note: safeString(body.note, 500) };
  await c.env.DB.prepare('INSERT INTO bills (id,due_month,title,kind,amount,note) VALUES (?,?,?,?,?,?)').bind(bill.id,bill.due_month,bill.title,bill.kind,bill.amount,bill.note).run();
  return c.json(bill, 201);
});

app.put('/api/bills/:id', async c => {
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !monthPattern.test(String(body.due_month)) || typeof body.kind !== 'string' || !(body.kind in billKinds) || !safeString(body.title) || !validAmount(body.amount)) return error('引落予定の入力を確認してください');
  const result = await c.env.DB.prepare('UPDATE bills SET due_month=?,title=?,kind=?,amount=?,note=? WHERE id=?').bind(body.due_month,safeString(body.title),body.kind,body.amount,safeString(body.note,500),c.req.param('id')).run();
  return result.meta.changes ? c.json({ ok: true }) : error('対象が見つかりません',404);
});

app.delete('/api/bills/:id', async c => {
  const result = await c.env.DB.prepare('DELETE FROM bills WHERE id=?').bind(c.req.param('id')).run();
  return result.meta.changes ? c.json({ ok: true }) : error('対象が見つかりません',404);
});

function isSupportedImage(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const header = /^data:(image\/(?:jpeg|png|webp));base64,/.exec(value);
  if (!header) return false;
  const data = value.slice(header[0].length);
  // Validate the encoding without decoding a second full copy of a large image.
  if (!data || /[^A-Za-z0-9+/=]/.test(data)) return false;
  const padding = data.indexOf('=');
  if (padding < 0 ? data.length % 4 === 1 :
      data.length % 4 !== 0 || !/^={1,2}$/.test(data.slice(padding))) return false;
  try {
    const prefix = atob(data.slice(0, 16));
    const signatures = { 'image/jpeg': [0xff,0xd8,0xff], 'image/png': [0x89,0x50,0x4e,0x47], 'image/webp': [0x52,0x49,0x46,0x46] } as const;
    return signatures[header[1] as keyof typeof signatures].every((byte,index) => prefix.charCodeAt(index) === byte)
      && (header[1] !== 'image/webp' || prefix.slice(8,12) === 'WEBP');
  } catch { return false; }
}

// One reviewed import is one card withdrawal. The total must match the saved rows.
app.post('/api/statements', async c => {
  const body = await c.req.json().catch(() => null) as {due_month?:unknown;card_id?:unknown;title?:unknown;confirmed_total?:unknown;entries?:unknown} | null;
  const entries = body?.entries;
  if (!body || !monthPattern.test(String(body.due_month)) || typeof body.card_id!=='string' || !safeString(body.title) || !validAmount(body.confirmed_total) || !Array.isArray(entries) || entries.length < 1) return error('カード明細の入力を確認してください');
  const card=await c.env.DB.prepare('SELECT id FROM shared_cards WHERE id=? AND active=1').bind(body.card_id).first();
  if (!card) return error('設定で使用中のカードを選んでください');
  const existing=await c.env.DB.prepare('SELECT id FROM card_statements WHERE due_month=? AND card_id=?').bind(body.due_month,body.card_id).first();
  if (existing) return error('この月のカード明細は登録済みです。明細画面で確認してください');
  const checked = entries.map((row:unknown) => {
    const item = row as Record<string,unknown> | null;
    return { spent_on:safeString(item?.spent_on,10),title:safeString(item?.title),category:item?.category,amount:item?.amount };
  });
  const allowedCategories=await categoryNames(c.env.DB);
  if (checked.some(row => (row.spent_on && !datePattern.test(row.spent_on)) || !row.title || !allowedCategories.includes(row.category as string) || !Number.isSafeInteger(row.amount) || Number(row.amount) === 0 || Math.abs(Number(row.amount)) > 100_000_000)) return error('明細行の入力を確認してください');
  const settings=await readCategorySettings(c.env.DB);
  if(checked.some(row=>isReviewCategory(String(row.category),settings)))return error('要確認の明細が残っています。費目を選んでから保存してください');
  const total=checked.reduce((sum,row)=>sum+Number(row.amount),0);
  if (total !== Number(body.confirmed_total)) return error('カード引落額と明細行の合計が一致しません');
  const id=crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO card_statements (id,card_id,due_month,title,confirmed_total) VALUES (?,?,?,?,?)').bind(id,body.card_id,body.due_month,safeString(body.title),total),
    ...checked.map(row=>c.env.DB.prepare('INSERT INTO card_entries (id,statement_id,spent_on,title,category,amount) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),id,row.spent_on,row.title,row.category,Number(row.amount)))
  ]);
  return c.json({id,card_id:body.card_id,due_month:body.due_month,confirmed_total:total},201);
});

app.delete('/api/statements/:id', async c => {
  const id=c.req.param('id');
  const existing=await c.env.DB.prepare('SELECT id FROM card_statements WHERE id=?').bind(id).first();
  if (!existing) return error('対象が見つかりません',404);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM card_entries WHERE statement_id=?').bind(id),
    c.env.DB.prepare('DELETE FROM card_statements WHERE id=?').bind(id)
  ]);
  return c.json({ok:true});
});

app.put('/api/card-entries/:id/category', async c => {
  const body=await c.req.json().catch(()=>null) as {category?:unknown}|null;
  const allowedCategories=await categoryNames(c.env.DB);
  if (!allowedCategories.includes(body?.category as string)) return error('費目を選んでください');
  const result=await c.env.DB.prepare('UPDATE card_entries SET category=? WHERE id=?').bind(body!.category,c.req.param('id')).run();
  return result.meta.changes ? c.json({ok:true}) : error('対象が見つかりません',404);
});

app.put('/api/statements/:id/entries', async c => {
  const id=c.req.param('id');
  const body=await c.req.json().catch(()=>null) as {entries?:unknown}|null;
  if(!Array.isArray(body?.entries)||!body.entries.length)return error('明細を確認してください');
  const allowedCategories=await categoryNames(c.env.DB);
  const rows:{id:string;category:string;amount:number}[]=[];
  for(const item of body.entries){
    if(!item||typeof item!=='object')return error('明細を確認してください');
    const row=item as Record<string,unknown>;
    if(typeof row.id!=='string'||!allowedCategories.includes(row.category as string)||!Number.isSafeInteger(row.amount)||Number(row.amount)===0||Math.abs(Number(row.amount))>100_000_000)return error('費目と金額を確認してください（金額は0以外の整数）');
    rows.push({id:row.id,category:row.category as string,amount:Number(row.amount)});
  }
  const total=rows.reduce((sum,row)=>sum+row.amount,0);
  if(!validAmount(total))return error('明細の合計は1円以上、1億円以下にしてください');
  const existing=await c.env.DB.prepare('SELECT id FROM card_entries WHERE statement_id=?').bind(id).all<{id:string}>();
  if(!existing.results.length)return error('対象が見つかりません',404);
  const ids=new Set(rows.map(row=>row.id));
  if(ids.size!==rows.length||existing.results.length!==rows.length||existing.results.some(row=>!ids.has(row.id)))return error('明細が一致しません。開き直してください');
  await c.env.DB.batch([
    ...rows.map(row=>c.env.DB.prepare('UPDATE card_entries SET category=?,amount=? WHERE id=? AND statement_id=?').bind(row.category,row.amount,row.id,id)),
    c.env.DB.prepare('UPDATE card_statements SET confirmed_total=? WHERE id=?').bind(total,id)
  ]);
  return c.json({ok:true,confirmed_total:total});
});

app.post('/api/statement/analyze', async c => {
  const body=await c.req.json().catch(()=>null) as {images?:unknown;mode?:unknown;stream?:boolean}|null;
  if (!body || (body.mode !== 'demo' && body.mode !== 'live') || !Array.isArray(body.images) || body.images.length < 1 || !body.images.every(isSupportedImage)) return error('JPEG・PNG・WebPの画像を選んでください');
  if (body.mode === 'demo') {
    if (c.env.APP_ENV !== 'staging') return error('デモモードはステージング限定です',404);
    return c.json({confirmed_total:6840,entries:[
      {spent_on:'',title:'デモ：スーパー',amount:2980,category:'食費'},
      {spent_on:'',title:'デモ：ドラッグストア',amount:1660,category:'日用品費'},
      {spent_on:'',title:'デモ：電車',amount:2200,category:'交通費'}
    ],demo:true});
  }
  const model=AI_MODEL;
  if (!c.env.OPENAI_API_KEY) return error('AIの設定がまだありません',503);
  const settings=await readCategorySettings(c.env.DB);
  const allowedCategories=allCategoryAppearances(settings).map(item=>item.category);
  const reviewCategory=fallbackCategory(settings);
  const classifiedOther=otherCategory(settings);
  const imageParts=body.images.map(image=>({type:'input_image',image_url:image,detail:'high'}));
  const schema={type:'object',properties:{confirmed_total:{type:'integer'},entries:{type:'array',items:{type:'object',properties:{spent_on:{type:'string'},title:{type:'string'},category:{type:'string',enum:allowedCategories},amount:{type:'integer'}},required:['spent_on','title','category','amount'],additionalProperties:false}}},required:['confirmed_total','entries'],additionalProperties:false};
  const content=[
    {type:'input_text',text:`同じ共有カードの利用明細スクリーンショットを読み取る。渡された画像をすべて確認する。同じ請求に含まれる本人・家族カード・Apple Payなど全利用者・全支払手段の利用行を対象にする。スクロール境界に重なる同一行は、前後の並びと画像内の位置も確認して1回だけ抽出する。同日・同店・同額というだけで別の利用を重複扱いにしない。端で切れた行は他の画像で完全な行を確認する。利用日は支払月とは異なる場合がある。26.08.02のような日付は画像の年を踏まえて2026-08-02にする。各利用行を抽出して、利用日YYYY-MM-DD（読めなければ空文字）、店名または内容（読めなければ空文字）、円の整数額（返金は負数）、費目を ${allowedCategories.join('、')} のいずれかに分類する。費目の判断に必要な情報が不足している場合は「${reviewCategory}」にする。「${classifiedOther}」は内容を判断できたうえで既存費目のどれにも当てはまらない場合だけにする。その他と要確認を混同しない。金額が表示されていない・読めない利用行はamountを0、費目を「${reviewCategory}」にして確認に回す。合計に合わせるために金額や行を推測して補完しない。推測で行や値を作らない。請求全体のお支払い金額・お支払金額総合計が画面に明示されていればconfirmed_totalに入れる。利用者別のお支払い金額小計を請求全体の確定額にしない。明示がなければ0。ポイント表示・未確定額・残高・小計を利用行に含めない。JSONのみ。`},
    ...imageParts
  ];
  const options={
    reasoning:{effort:'low',summary:'auto'},
    instructions:'公開用の思考の要約は日本語で簡潔に記述する。最終出力は指定されたJSON形式を厳守する。',
    text:{format:{type:'json_schema',name:'card_statement',strict:true,schema}}
  };
  if(body.stream===true){
    const abort=new AbortController();
    const watch=idleWatch(()=>abort.abort(new ImportError('timeout')));
    const cancel=()=>abort.abort();
    const cleanup=()=>{watch.clear();c.req.raw.signal.removeEventListener('abort',cancel);};
    c.req.raw.signal.addEventListener('abort',cancel,{once:true});
    if(c.req.raw.signal.aborted)abort.abort();
    try {
      const upstream=await abortable(fetch('https://api.openai.com/v1/responses',{method:'POST',signal:abort.signal,headers:{Authorization:`Bearer ${c.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'user',content}],store:false,...options,stream:true})}),abort.signal);
      if(!upstream.ok||!upstream.body){
        const data=await abortable(upstream.json(),abort.signal).catch(()=>{abort.signal.throwIfAborted();return null;}) as {error?:{code?:unknown}}|null;
        const failure=upstreamImportError(data?.error?.code,upstream.status);
        logImportFailure(failure,0,upstream.status);
        cleanup();abort.abort();return error(failure.message,502);
      }
      watch.clear();
      return statementStream(upstream,allowedCategories,abort,cleanup,reviewCategory);
    }catch(failure){
      const reason=abort.signal.reason instanceof ImportError?abort.signal.reason:failure;
      cleanup();abort.abort();
      if(reason instanceof ImportError){logImportFailure(reason,0);return error(reason.message,502);}
      return error('明細の読み取りに接続できませんでした',502);
    }
  }
  const response=await openai(c.env.OPENAI_API_KEY,model,content,options);
  if (!response) return error('明細を読み取れませんでした。手入力で仕分けできます',502);
  let parsed: {confirmed_total?:unknown;entries?:unknown};
  try {parsed=JSON.parse(response);} catch {return error('AIの結果を確認できませんでした',502);}
  if (!Array.isArray(parsed.entries)) return error('AIから受信した明細の形式を確認できませんでした',502);
  const entries=parsed.entries.map((raw:unknown)=>{const entry=(raw&&typeof raw==='object'?raw:{}) as Record<string,unknown>;return {spent_on:datePattern.test(String(entry.spent_on))?entry.spent_on:'',title:safeString(entry.title),category:allowedCategories.includes(entry.category as string)?entry.category:reviewCategory,amount:Number.isSafeInteger(entry.amount)&&Math.abs(Number(entry.amount))<=100_000_000?Number(entry.amount):0};});
  return c.json({entries,confirmed_total:validAmount(parsed.confirmed_total)?Number(parsed.confirmed_total):0});
});

app.post('/api/report/comment', async c => {
  const body = await c.req.json().catch(() => null) as { month?:string; mode?:unknown } | null;
  const month = body?.month || '';
  if (!monthPattern.test(month)) return error('月を確認してください');
  if (body?.mode !== 'demo' && body?.mode !== 'live') return error('コメントのモードを選択してください');
  if (body.mode === 'demo' && c.env.APP_ENV !== 'staging') return error('デモモードはステージング限定です',404);
  const rows = await c.env.DB.prepare('SELECT e.category,SUM(e.amount) AS amount FROM card_entries e JOIN card_statements s ON s.id=e.statement_id WHERE s.due_month = ? GROUP BY e.category').bind(month).all<{category:string;amount:number}>();
  if (!rows.results.length) return c.json({comment:'この月の支出を登録すると、傾向を表示できます。',demo:body.mode==='demo'});
  if (body.mode === 'demo') {
    const sorted = [...rows.results].sort((a,b)=>b.amount-a.amount);
    const total = sorted.reduce((sum,item)=>sum+item.amount,0);
    return c.json({comment:`デモ表示（AI未使用）：${month}の支出合計は${total.toLocaleString('ja-JP')}円。最も多い費目は${sorted[0].category}の${sorted[0].amount.toLocaleString('ja-JP')}円です。`,demo:true});
  }
  const key = c.env.OPENAI_API_KEY;
  if (!key) return error('AIの設定がまだありません',503);
  const result = await openai(key,AI_MODEL,[{type:'input_text',text:`${month}の費目別支出（円）: ${JSON.stringify(rows.results)}。事実のみ、費目の傾向を日本語で2文、80字以内で説明。助言や個人情報の推測をしない。` }],{max_output_tokens:500});
  return result ? c.json({comment:result.slice(0,300)}) : error('コメントを作成できませんでした',502);
});

async function openai(key:string,model:string,content:unknown[],extra:Record<string,unknown>={}): Promise<string|null> {
  const response = await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'user',content}],store:false,reasoning:{effort:'none'},...extra})});
  if (!response.ok) { console.error(JSON.stringify({event:'openai_error',status:response.status})); return null; }
  const data = await response.json() as {status?:string;incomplete_details?:{reason?:unknown};output?:Array<{content?:Array<{type:string;text?:string}>}>};
  if(data.status&&data.status!=='completed'){logImportFailure(incompleteImportError(data.incomplete_details?.reason),0);return null;}
  return data.output?.flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text||'').join('') || null;
}

app.get('*', c => {
  const path = new URL(c.req.url).pathname;
  const asset = embeddedAssets[path] || (path.includes('.') ? undefined : embeddedAssets['/index.html']);
  return asset ? new Response(asset.body,{headers:{'Content-Type':asset.mime,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}}) : error('見つかりません',404);
});
app.onError((e,c) => { console.error(JSON.stringify({event:'request_error',path:c.req.path,message:e instanceof Error?e.message:'unknown'})); return error('処理に失敗しました。もう一度お試しください',500); });
export default app;
