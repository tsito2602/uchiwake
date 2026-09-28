import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import app from '../dist/worker.mjs';
import { authEnv, sessionCookie } from './auth-fixture.mjs';
export function spaceFixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const name of readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
 const DB={prepare(sql){const stmt=db.prepare(sql);const bound=(values=[])=>({bind:(...args)=>bound(args),all:async()=>({results:stmt.all(...values)}),first:async()=>stmt.get(...values)??null,run:async()=>({success:true,meta:{changes:stmt.run(...values).changes}}),runSync:()=>({success:true,meta:{changes:stmt.run(...values).changes}})});return bound();},async batch(statements){db.exec('BEGIN');try{const results=statements.map(s=>s.runSync());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={...authEnv,ALLOWED_EMAILS:'owner@example.test,b@example.test,c@example.test,outsider@example.test',APP_ENV:'staging',DB};
 async function call(user,path,method='GET',body,space){
  const cookie=await sessionCookie({sub:user,email:`${user}@example.test`,name:user},env);
  return app.fetch(new Request(`https://example.test/api${path}`,{method,headers:{Cookie:cookie,Origin:'https://example.test','Content-Type':'application/json',...(space?{'X-Space-Id':space}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
 }
 return {db,DB,env,call};
}
