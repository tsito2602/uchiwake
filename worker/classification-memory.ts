import { Hono } from 'hono';
import type { SpaceEnv } from './spaces';
import type { EntryDraft } from '../src/domain';
import { merchantKey, validRule, type ClassificationRule } from '../src/import-policy';

export const classificationRoutes=new Hono<SpaceEnv>();
classificationRoutes.get('/rules',async c=>{
  const rules=await c.env.DB.prepare('SELECT id,merchant_key,context_keyword,category FROM classification_rules WHERE space_id=? ORDER BY created_at DESC').bind(c.get('spaceId')).all<ClassificationRule>();
  return c.json({rules:rules.results});
});
classificationRoutes.delete('/rules/:id',async c=>{
  const result=await c.env.DB.prepare('DELETE FROM classification_rules WHERE id=? AND space_id=?').bind(c.req.param('id'),c.get('spaceId')).run();
  return c.json(result.meta.changes?{ok:true}:{error:'ルールが見つかりません'},result.meta.changes?200:404);
});
export async function classificationMemory(db:D1Database,space:string,entry:EntryDraft,allowed:string[]) {
  const key=merchantKey(entry.title);
  const [rules,history]=await Promise.all([
    db.prepare('SELECT id,merchant_key,context_keyword,category FROM classification_rules WHERE space_id=? AND merchant_key=?').bind(space,key).all<ClassificationRule>(),
    db.prepare('SELECT category FROM classification_history WHERE space_id=? AND merchant_key=? ORDER BY created_at DESC,rowid DESC LIMIT 5').bind(space,key).all<{category:string}>()
  ]);
  return {rules:rules.results.filter(rule=>allowed.includes(rule.category)),history:[...new Set(history.results.map(row=>row.category).filter(category=>allowed.includes(category)))]};
}
// Load once for a streamed statement, not two D1 queries per returned row.
export async function classificationMemoryForSpace(db:D1Database,space:string,allowed:string[]) {
  const [rules,history]=await Promise.all([
    db.prepare('SELECT id,merchant_key,context_keyword,category FROM classification_rules WHERE space_id=?').bind(space).all<ClassificationRule>(),
    db.prepare('SELECT merchant_key,category FROM (SELECT merchant_key,category,ROW_NUMBER() OVER (PARTITION BY merchant_key ORDER BY created_at DESC,rowid DESC) AS rank FROM classification_history WHERE space_id=?) WHERE rank<=5 ORDER BY merchant_key,rank').bind(space).all<{merchant_key:string;category:string}>()
  ]);
  const byMerchant=new Map<string,string[]>();
  for(const row of history.results){
    if(!allowed.includes(row.category))continue;
    const categories=byMerchant.get(row.merchant_key)??[];
    if(!categories.includes(row.category))categories.push(row.category);
    byMerchant.set(row.merchant_key,categories);
  }
  return {rules:rules.results.filter(rule=>allowed.includes(rule.category)),history:(title:string)=>byMerchant.get(merchantKey(title))??[]};
}
export function importMemoryWrites(db:D1Database,space:string,user:string,entries:EntryDraft[]) {
  const writes:D1PreparedStatement[]=[];
  for(const entry of entries){
    const meta=entry.import_meta;
    if(!meta||typeof meta!=='object')continue;
    if(meta.original_category&&meta.original_category!==entry.category){
      writes.push(db.prepare('INSERT INTO classification_history (id,space_id,merchant_key,title,category,previous_category) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),space,merchantKey(entry.title),entry.title,entry.category,String(meta.original_category).slice(0,30)));
    }
    if(meta.remember_rule===true){
      if(!validRule(entry))throw new Error('ルールの条件を確認してください。幅広い商品を扱うお店では、読み取った購入内容を条件に指定してください。');
      writes.push(db.prepare('INSERT INTO classification_rules (id,space_id,merchant_key,context_keyword,category,created_by) VALUES (?,?,?,?,?,?) ON CONFLICT(space_id,merchant_key,context_keyword) DO UPDATE SET category=excluded.category,created_by=excluded.created_by').bind(crypto.randomUUID(),space,merchantKey(entry.title),merchantKey(meta.rule_keyword||''),entry.category,user));
    }
  }
  return writes;
}
