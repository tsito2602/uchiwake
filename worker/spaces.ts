import { Hono, type Context } from 'hono';
import type { AuthBindings, AuthUser } from './auth';
import { googleAvatar } from './profile';
import { saveSpacePreferences } from './space-preferences';
import { defaultConfig, validateConfig, type Member, type Space, type SettlementConfig, type SettlementSettings } from '../src/spaces';
export type SpaceEnv = {Bindings:AuthBindings&import('./ai-bindings').AIBindings&{DB:D1Database;APP_ENV:string;OPENAI_API_KEY?:string};Variables:{user:AuthUser;space:Space;spaceId:string}};
export const spacesRoutes=new Hono<SpaceEnv>();
const monthPattern=/^\d{4}-(0[1-9]|1[0-2])$/;
const fail=(error:string,status=400)=>Response.json({error},{status});
const cleanName=(v:unknown)=>typeof v==='string'&&v.trim().length<=40&&!/[\u0000-\u001f\u007f]/.test(v)?v.trim():'';
export async function membership(db:D1Database,id:string,user:string) {
 return db.prepare(`SELECT s.id,s.name,s.kind,s.owner_id FROM spaces s JOIN space_members m ON m.space_id=s.id
 WHERE s.id=? AND m.user_id=? AND m.active=1 AND s.deleted_at IS NULL`).bind(id,user).first<Space>();
}
export async function membersFor(db:D1Database,id:string):Promise<Member[]> {
 const rows=await db.prepare(`SELECT m.user_id,COALESCE(NULLIF(p.display_name,''),NULLIF(m.name,'')) AS name,m.active,p.avatar_url FROM space_members m
 LEFT JOIN user_profiles p ON p.user_id=m.user_id WHERE m.space_id=? ORDER BY m.joined_at,m.rowid`).bind(id).all<{user_id:string;name:string|null;active:number;avatar_url:string|null}>();
 return rows.results.map((m,index)=>({user_id:m.user_id,name:m.name||`メンバー${index+1}`,active:!!m.active,avatarUrl:googleAvatar(m.avatar_url)}));
}
export async function settlementFor(db:D1Database,space:Space,month:string,members:Member[],snapshot=false):Promise<SettlementSettings> {
 const row=await db.prepare(`SELECT config,revision,scope,month FROM settlement_rules WHERE space_id=? AND
 ((scope='month' AND month=?) OR (scope='default' AND month<=?)) ORDER BY CASE scope WHEN 'month' THEN 0 ELSE 1 END,month DESC LIMIT 1`)
 .bind(space.id,month,month).first<{config:string;revision:number;scope:'month'|'default';month:string}>();
 const config=row?JSON.parse(row.config) as SettlementConfig:defaultConfig(members);
 if(snapshot&&row?.scope!=='month'){
  await db.prepare(`INSERT INTO settlement_rules(space_id,month,scope,config) VALUES (?,?,'month',?) ON CONFLICT DO NOTHING`).bind(space.id,month,JSON.stringify(config)).run();
  return settlementFor(db,space,month,members);
 }
 return {config,revision:row?.revision??0,scope:row?.scope??'default',month:row?.month??month};
}
const initialConfig=(user:AuthUser)=>JSON.stringify(defaultConfig([{user_id:user.id,name:user.name,active:true}]));
async function bootstrap(db:D1Database,user:AuthUser,env:AuthBindings) {
 const personal=`personal:${user.id}`;
 await db.batch([
  db.prepare("UPDATE space_members SET name=? WHERE user_id=? AND ?<>'' AND name<>?").bind(user.name,user.id,user.name,user.name),
  db.prepare(`INSERT INTO spaces(id,name,kind,owner_id) VALUES (?,'個人','personal',?) ON CONFLICT DO NOTHING`).bind(personal,user.id),
  db.prepare(`INSERT INTO space_members(space_id,user_id,name) VALUES (?,?,?) ON CONFLICT DO NOTHING`).bind(personal,user.id,user.name),
  db.prepare("INSERT INTO settlement_rules(space_id,month,scope,config) VALUES (?,'0000-01','default',?) ON CONFLICT DO NOTHING").bind(personal,initialConfig(user))
 ]);
 // Only the pre-existing primary allowlisted account can claim the legacy data.
 if(user.email.toLowerCase()===(env.ALLOWED_EMAILS||'').split(',')[0].trim().toLowerCase()){
  await db.batch([
   db.prepare(`UPDATE spaces SET owner_id=? WHERE id='legacy' AND owner_id IS NULL`).bind(user.id),
   db.prepare(`INSERT INTO space_members(space_id,user_id,name) SELECT id,?,? FROM spaces WHERE id='legacy' AND owner_id=? ON CONFLICT DO NOTHING`).bind(user.id,user.name,user.id),
   db.prepare("INSERT INTO settlement_rules(space_id,month,scope,config) SELECT id,'0000-01','default',? FROM spaces WHERE id='legacy' AND owner_id=? ON CONFLICT DO NOTHING").bind(initialConfig(user),user.id)
  ]);
 }
}
spacesRoutes.get('/',async c=>{
 const user=c.get('user');await bootstrap(c.env.DB,user,c.env);
 const rows=await c.env.DB.prepare(`SELECT s.id,s.name,s.kind,s.owner_id FROM spaces s JOIN space_members m ON m.space_id=s.id
 WHERE m.user_id=? AND m.active=1 AND s.deleted_at IS NULL ORDER BY s.kind,s.created_at,s.id`).bind(user.id).all<Space>();
 return c.json({spaces:rows.results});
});
spacesRoutes.post('/',async c=>{
 const body=await c.req.json().catch(()=>null),name=cleanName(body?.name);if(!name)return fail('スペース名は1〜40文字で入力してください');
 const user=c.get('user'),id=crypto.randomUUID(),space:Space={id,name,kind:'shared',owner_id:user.id};
 await c.env.DB.batch([
  c.env.DB.prepare(`INSERT INTO spaces(id,name,kind,owner_id) VALUES (?,?,'shared',?)`).bind(id,name,user.id),
  c.env.DB.prepare('INSERT INTO space_members(space_id,user_id,name) VALUES (?,?,?)').bind(id,user.id,user.name),
  c.env.DB.prepare("INSERT INTO settlement_rules(space_id,month,scope,config) VALUES (?,'0000-01','default',?)").bind(id,initialConfig(user))
 ]);return c.json({space},201);
});
async function hashCode(code:string) {
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const normalizeCode=(v:unknown)=>typeof v==='string'?v.toUpperCase().replace(/[\s-]/g,''):'';
async function checkInvite(c:Context<SpaceEnv>,raw:unknown) {
 const user=c.get('user'),window=Math.floor(Date.now()/600000);
 const attempt=await c.env.DB.prepare(`INSERT INTO invite_attempts(user_id,window,attempts) VALUES (?,?,1)
 ON CONFLICT(user_id) DO UPDATE SET window=excluded.window,attempts=CASE WHEN invite_attempts.window=excluded.window THEN invite_attempts.attempts+1 ELSE 1 END RETURNING attempts`).bind(user.id,window).first<{attempts:number}>();
 if((attempt?.attempts??0)>20)return {error:fail('試行回数が多いため、10分後にもう一度お試しください',429)};
 const code=normalizeCode(raw);if(!/^[A-HJ-NP-Z2-9]{12}$/.test(code))return {error:fail('招待コードを確認してください')};
 const hash=await hashCode(code);
 const invite=await c.env.DB.prepare(`SELECT i.space_id,s.name,COALESCE(NULLIF(p.display_name,''),NULLIF(m.name,'')) AS inviter FROM space_invites i JOIN spaces s ON s.id=i.space_id
 JOIN space_members m ON m.space_id=s.id AND m.user_id=i.created_by
 LEFT JOIN user_profiles p ON p.user_id=i.created_by
 WHERE i.code_hash=? AND i.expires_at>? AND i.revoked=0 AND (i.consumed_by IS NULL OR i.consumed_by=?) AND s.deleted_at IS NULL AND m.active=1`).bind(hash,Date.now(),user.id).first<{space_id:string;name:string;inviter:string|null}>();
 return invite?{invite,hash}:{error:fail('招待コードが無効か、有効期限が切れています',404)};
}
spacesRoutes.post('/invite-preview',async c=>{
 const body=await c.req.json().catch(()=>null),result=await checkInvite(c,body?.code);if(result.error)return result.error;
 return c.json(result.invite!);
});
spacesRoutes.post('/join',async c=>{
 const body=await c.req.json().catch(()=>null),result=await checkInvite(c,body?.code);if(result.error)return result.error;
 const user=c.get('user'),invite=result.invite!;
 if(body?.space_id!==invite.space_id)return fail('参加先を確認してください');
 await c.env.DB.batch([
  c.env.DB.prepare(`UPDATE space_invites SET consumed_by=? WHERE code_hash=? AND consumed_by IS NULL AND revoked=0 AND expires_at>?`).bind(user.id,result.hash!,Date.now()),
  c.env.DB.prepare(`INSERT INTO space_members(space_id,user_id,name) SELECT space_id,?,? FROM space_invites
   WHERE code_hash=? AND consumed_by=? AND revoked=0 AND expires_at>?
   ON CONFLICT(space_id,user_id) DO UPDATE SET active=1,name=CASE WHEN excluded.name<>'' THEN excluded.name ELSE space_members.name END`).bind(user.id,user.name,result.hash!,user.id,Date.now())
 ]);
 const space=await membership(c.env.DB,invite.space_id,user.id);if(!space)return fail('招待コードは使用済みです',409);
 return c.json({space});
});
spacesRoutes.use('/:id/*',async(c,next)=>{
 const space=await membership(c.env.DB,c.req.param('id')!,c.get('user').id);if(!space)return fail('スペースが見つかりません',404);
 c.set('space',space);c.set('spaceId',space.id);await next();
});
spacesRoutes.get('/:id/details',async c=>{
 const space=c.get('space'),members=await membersFor(c.env.DB,space.id),month=c.req.query('month')||'';
 if(!monthPattern.test(month))return fail('月を確認してください');
 return c.json({space,members,settlement:await settlementFor(c.env.DB,space,month,members)});
});
spacesRoutes.post('/:id/invites',async c=>{
 const space=c.get('space'),user=c.get('user');if(space.kind!=='shared'||space.owner_id!==user.id)return fail('招待できるのは作成者だけです',403);
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
 const code=[...crypto.getRandomValues(new Uint8Array(12))].map(b=>alphabet[b%32]).join('');
 const expires=Date.now()+48*60*60*1000;
 await c.env.DB.prepare('INSERT INTO space_invites(code_hash,space_id,created_by,expires_at) VALUES (?,?,?,?)').bind(await hashCode(code),space.id,user.id,expires).run();
 return c.json({code:code.match(/.{4}/g)!.join('-'),expires_at:expires},201);
});
spacesRoutes.put('/:id/name',async c=>{
 const space=c.get('space');if(space.owner_id!==c.get('user').id)return fail('変更できるのは作成者だけです',403);
 const body=await c.req.json().catch(()=>null),name=cleanName(body?.name);if(!name)return fail('スペース名は1〜40文字で入力してください');
 await c.env.DB.prepare('UPDATE spaces SET name=? WHERE id=?').bind(name,space.id).run();return c.json({ok:true});
});
spacesRoutes.put('/:id/preferences',async c=>{
 const body=await c.req.json().catch(()=>null);
 if(typeof body?.rent_enabled!=='boolean'||!Number.isSafeInteger(body?.revision)||body.revision<0)return fail('家賃の設定を確認してください');
 if(!await saveSpacePreferences(c.env.DB,c.get('spaceId'),body.rent_enabled,body.revision))return fail('ほかのメンバーが変更しました。最新の設定を確認してください',409);
 return c.json({rent_enabled:body.rent_enabled,revision:body.revision+1});
});
spacesRoutes.delete('/:id/space',async c=>{
 const space=c.get('space');if(space.kind!=='shared'||space.owner_id!==c.get('user').id)return fail('削除できるのは共有スペースの作成者だけです',403);
 await c.env.DB.batch([
  c.env.DB.prepare('UPDATE spaces SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').bind(space.id),
  c.env.DB.prepare('UPDATE space_invites SET revoked=1 WHERE space_id=?').bind(space.id)
 ]);return c.json({ok:true});
});
spacesRoutes.delete('/:id/members/:userId',async c=>{
 const space=c.get('space'),userId=c.req.param('userId');
 if(space.kind!=='shared'||space.owner_id!==c.get('user').id||userId===space.owner_id)return fail('このメンバーは削除できません',403);
 await c.env.DB.batch([
  c.env.DB.prepare('UPDATE space_members SET active=0 WHERE space_id=? AND user_id=?').bind(space.id,userId),
  c.env.DB.prepare('UPDATE space_invites SET revoked=1 WHERE space_id=?').bind(space.id)
 ]);return c.json({ok:true});
});
spacesRoutes.put('/:id/settlement',async c=>{
 const space=c.get('space'),body=await c.req.json().catch(()=>null);
 if(space.kind!=='shared'||!monthPattern.test(body?.month)||!['month','default'].includes(body?.scope)||!Number.isSafeInteger(body?.revision)||body.revision<0)return fail('負担設定を確認してください');
 const members=await membersFor(c.env.DB,space.id);
 // Former members remain available for historical allocations; new defaults require active members.
 if(!validateConfig(body.config,new Set(members.filter(m=>body.scope==='month'||m.active).map(m=>m.user_id))))return fail('対象者と割合を確認してください。割合は合計100％にしてください');
 const result=await c.env.DB.prepare(`INSERT INTO settlement_rules(space_id,month,scope,config,revision)
 SELECT ?,?,?,?,1 WHERE ?=0 ON CONFLICT(space_id,month,scope) DO NOTHING`).bind(space.id,body.month,body.scope,JSON.stringify(body.config),body.revision).run();
 if(!result.meta.changes){
  const updated=await c.env.DB.prepare(`UPDATE settlement_rules SET config=?,revision=revision+1 WHERE space_id=? AND month=? AND scope=? AND revision=?`).bind(JSON.stringify(body.config),space.id,body.month,body.scope,body.revision).run();
  if(!updated.meta.changes)return fail('ほかのメンバーが変更しました。開き直して確認してください',409);
 }
 return c.json({ok:true});
});
spacesRoutes.get('/:id/defaults',async c=>{
 const month=c.req.query('month')||'';if(!monthPattern.test(month))return fail('月を確認してください');
 const row=await c.env.DB.prepare(`SELECT config,revision,month FROM settlement_rules WHERE space_id=? AND scope='default' AND month<=? ORDER BY month DESC LIMIT 1`).bind(c.get('spaceId'),month).first<{config:string;revision:number;month:string}>();
 const members=await membersFor(c.env.DB,c.get('spaceId'));
 return c.json({config:row?JSON.parse(row.config):defaultConfig(members),revision:row?.month===month?row.revision:0,month,scope:'default'});
});
