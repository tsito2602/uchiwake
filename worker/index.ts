import { Hono } from 'hono';
import { billKinds, categories, type BillKind } from '../src/domain';
import { embeddedAssets } from './generated-assets';

type Bindings = { DB: D1Database; RECEIPTS: R2Bucket; APP_ENV: string; APP_PASSWORD?: string; OPENAI_API_KEY?: string; OPENAI_MODEL: string };
const app = new Hono<{ Bindings: Bindings }>();
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const error = (message: string, status: 400 | 401 | 404 | 413 | 500 | 502 | 503 = 400) => Response.json({ error: message }, { status });
const safeString = (v: unknown, max = 100) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const validAmount = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 100_000_000;

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
  const [bills, expenses] = await Promise.all([
    c.env.DB.prepare('SELECT id,due_month,title,kind,amount,note FROM bills WHERE due_month = ? ORDER BY created_at DESC').bind(month).all(),
    c.env.DB.prepare('SELECT id,spent_on,title,category,amount,note,receipt_key FROM expenses WHERE spent_on >= ? AND spent_on < ? ORDER BY spent_on DESC, created_at DESC').bind(`${month}-01`, nextMonth(month) + '-01').all()
  ]);
  return c.json({ month, bills: bills.results, expenses: expenses.results, ai_enabled: Boolean(c.env.OPENAI_API_KEY), demo_enabled: c.env.APP_ENV === 'staging' });
});

function nextMonth(month: string) {
  const [year, m] = month.split('-').map(Number);
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
}

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

app.post('/api/expenses', async c => {
  if (Number(c.req.header('Content-Length')) > 6_000_000) return error('画像は4MB以下にしてください',413);
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !datePattern.test(String(body.spent_on)) || !safeString(body.title) || !categories.includes(body.category as typeof categories[number]) || !validAmount(body.amount)) return error('支出の入力を確認してください');
  let receipt_key: string | null = null;
  if (body.image) {
    const image = parseImage(body.image);
    if (!image) return error('JPEG・PNG・WebPの4MB以下の画像を選んでください');
    receipt_key = `receipts/${crypto.randomUUID()}`;
    await c.env.RECEIPTS.put(receipt_key, image.bytes, { httpMetadata: { contentType: image.mime } });
  }
  const expense = { id: crypto.randomUUID(), spent_on: String(body.spent_on), title: safeString(body.title), category: body.category as string, amount: Number(body.amount), note: safeString(body.note,500), receipt_key };
  try {
    await c.env.DB.prepare('INSERT INTO expenses (id,spent_on,title,category,amount,note,receipt_key) VALUES (?,?,?,?,?,?,?)').bind(expense.id,expense.spent_on,expense.title,expense.category,expense.amount,expense.note,receipt_key).run();
  } catch (e) {
    if (receipt_key) await c.env.RECEIPTS.delete(receipt_key);
    throw e;
  }
  return c.json(expense,201);
});

app.put('/api/expenses/:id', async c => {
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !datePattern.test(String(body.spent_on)) || !safeString(body.title) || !categories.includes(body.category as typeof categories[number]) || !validAmount(body.amount)) return error('支出の入力を確認してください');
  const result = await c.env.DB.prepare('UPDATE expenses SET spent_on=?,title=?,category=?,amount=?,note=? WHERE id=?').bind(body.spent_on,safeString(body.title),body.category,body.amount,safeString(body.note,500),c.req.param('id')).run();
  return result.meta.changes ? c.json({ ok: true }) : error('対象が見つかりません',404);
});

app.delete('/api/expenses/:id', async c => {
  const item = await c.env.DB.prepare('SELECT receipt_key FROM expenses WHERE id=?').bind(c.req.param('id')).first<{receipt_key:string|null}>();
  if (!item) return error('対象が見つかりません',404);
  await c.env.DB.prepare('DELETE FROM expenses WHERE id=?').bind(c.req.param('id')).run();
  if (item.receipt_key) await c.env.RECEIPTS.delete(item.receipt_key);
  return c.json({ ok:true });
});

app.get('/api/expenses/:id/receipt', async c => {
  const item = await c.env.DB.prepare('SELECT receipt_key FROM expenses WHERE id=?').bind(c.req.param('id')).first<{receipt_key:string|null}>();
  if (!item?.receipt_key) return error('画像がありません',404);
  const object = await c.env.RECEIPTS.get(item.receipt_key);
  if (!object) return error('画像がありません',404);
  return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType || 'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
});

function parseImage(value: unknown): { mime:string; bytes:Uint8Array } | null {
  if (typeof value !== 'string') return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match || match[2].length > 5_600_000) return null;
  try {
    const raw = atob(match[2]);
    if (raw.length > 4_000_000) return null;
    const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
    const signatures = { 'image/jpeg': [0xff,0xd8,0xff], 'image/png': [0x89,0x50,0x4e,0x47], 'image/webp': [0x52,0x49,0x46,0x46] } as const;
    if (!signatures[match[1] as keyof typeof signatures].every((byte,index) => bytes[index] === byte)) return null;
    return { mime:match[1],bytes };
  } catch { return null; }
}

app.post('/api/receipt/analyze', async c => {
  if (Number(c.req.header('Content-Length')) > 6_000_000) return error('画像は4MB以下にしてください',413);
  const body = await c.req.json().catch(() => null) as { image?:unknown; mode?:unknown; scenario?:unknown } | null;
  if (body?.mode !== 'demo' && body?.mode !== 'live') return error('読取モードを選択してください');
  const image = parseImage(body?.image);
  if (!image) return error('JPEG・PNG・WebPの4MB以下の画像を選んでください');
  if (body.mode === 'demo') {
    if (c.env.APP_ENV !== 'staging') return error('デモモードはステージング限定です',404);
    const examples = {
      supermarket: { title:'デモ：スーパー', amount:1980, category:'食費' },
      restaurant: { title:'デモ：カフェ', amount:1240, category:'外食費' },
      unclear: { title:'', amount:0, category:'その他・要確認' }
    } as const;
    if (typeof body.scenario !== 'string' || !(body.scenario in examples)) return error('デモの例を選んでください');
    const sample = examples[body.scenario as keyof typeof examples];
    const spent_on = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    return c.json({ ...sample, spent_on, note:'デモ読取のサンプルです。画像の内容は読み取っていません。', demo:true });
  }
  if (!c.env.OPENAI_API_KEY) return error('AIの設定がまだありません',503);
  const result = await openai(c.env.OPENAI_API_KEY,c.env.OPENAI_MODEL, [
    { type:'input_text', text:`日本のレシート1枚から店舗名、合計金額（円の整数）、購入日（YYYY-MM-DD）、費目を読み取る。費目は ${categories.join('、')} のいずれか。推測が必要な箇所は空文字か0、費目は「その他・要確認」。個別の商品額を合計金額として使わない。JSONのみ返す: {"title":"","amount":0,"spent_on":"","category":"その他・要確認"}` },
    { type:'input_image',image_url:body!.image,detail:'high' }
  ],true);
  if (!result) return error('AIの読み取りに失敗しました。手入力できます',502);
  let parsed: Record<string,unknown>;
  try { parsed = JSON.parse(result.replace(/^```(?:json)?\s*|\s*```$/g,'')); } catch { return error('AIの結果を確認できませんでした',502); }
  return c.json({ title:safeString(parsed.title), amount:validAmount(parsed.amount) ? Number(parsed.amount) : 0, spent_on:datePattern.test(String(parsed.spent_on)) ? parsed.spent_on : '', category:categories.includes(parsed.category as typeof categories[number]) ? parsed.category : 'その他・要確認' });
});

app.post('/api/report/comment', async c => {
  const body = await c.req.json().catch(() => null) as { month?:string; mode?:unknown } | null;
  const month = body?.month || '';
  if (!monthPattern.test(month)) return error('月を確認してください');
  if (body?.mode !== 'demo' && body?.mode !== 'live') return error('コメントのモードを選択してください');
  if (body.mode === 'demo' && c.env.APP_ENV !== 'staging') return error('デモモードはステージング限定です',404);
  const rows = await c.env.DB.prepare('SELECT category,SUM(amount) AS amount FROM expenses WHERE spent_on >= ? AND spent_on < ? GROUP BY category').bind(`${month}-01`,nextMonth(month)+'-01').all<{category:string;amount:number}>();
  if (!rows.results.length) return c.json({comment:'この月の支出を登録すると、傾向を表示できます。',demo:body.mode==='demo'});
  if (body.mode === 'demo') {
    const sorted = [...rows.results].sort((a,b)=>b.amount-a.amount);
    const total = sorted.reduce((sum,item)=>sum+item.amount,0);
    return c.json({comment:`デモ表示（AI未使用）：${month}の支出合計は${total.toLocaleString('ja-JP')}円。最も多い費目は${sorted[0].category}の${sorted[0].amount.toLocaleString('ja-JP')}円です。`,demo:true});
  }
  const key = c.env.OPENAI_API_KEY;
  if (!key) return error('AIの設定がまだありません',503);
  const result = await openai(key,c.env.OPENAI_MODEL,[{type:'input_text',text:`${month}の費目別支出（円）: ${JSON.stringify(rows.results)}。事実のみ、費目の傾向を日本語で2文、80字以内で説明。助言や個人情報の推測をしない。` }]);
  return result ? c.json({comment:result.slice(0,300)}) : error('コメントを作成できませんでした',502);
});

async function openai(key:string,model:string,content:unknown[],receipt=false): Promise<string|null> {
  const schema = { type:'object',properties:{title:{type:'string'},amount:{type:'integer'},spent_on:{type:'string'},category:{type:'string',enum:[...categories]}},required:['title','amount','spent_on','category'],additionalProperties:false };
  const format = receipt ? {text:{format:{type:'json_schema',name:'receipt',strict:true,schema}}} : {};
  const response = await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'user',content}],store:false,reasoning:{effort:'none'},max_output_tokens:500,...format})});
  if (!response.ok) { console.error(JSON.stringify({event:'openai_error',status:response.status})); return null; }
  const data = await response.json() as {output?:Array<{content?:Array<{type:string;text?:string}>}>};
  return data.output?.flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text||'').join('') || null;
}

app.get('*', c => {
  const path = new URL(c.req.url).pathname;
  const asset = embeddedAssets[path] || (path.includes('.') ? undefined : embeddedAssets['/index.html']);
  return asset ? new Response(asset.body,{headers:{'Content-Type':asset.mime,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}}) : error('見つかりません',404);
});
app.onError((e,c) => { console.error(JSON.stringify({event:'request_error',path:c.req.path,message:e instanceof Error?e.message:'unknown'})); return error('処理に失敗しました。もう一度お試しください',500); });
export default app;
