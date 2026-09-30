// Shared-space context for legacy unit tests whose DB doubles only model a route.
// Authorization and isolation are tested against real SQLite in spaces.test.mjs.
import app from '../dist/worker.mjs';
const config={uniform:true,common:{mode:'equal',shares:[{user_id:'google-test-id',weight:1},{user_id:'partner',weight:1}]},items:{}};
export default {fetch(request,env,...rest){
 const headers=new Headers(request.headers);headers.set('X-Space-Id','legacy');
 const DB={...env.DB,prepare(sql){
  if(sql.includes('CREATE TABLE IF NOT EXISTS space_preferences'))return {run:async()=>({success:true})};
  if(sql.includes('FROM space_preferences'))return {bind(){return {first:async()=>({rent_enabled:1,revision:1})};}};
  const result=sql.includes('FROM spaces s JOIN space_members')?{id:'legacy',name:'家計',kind:'shared',owner_id:'google-test-id'}:sql.includes('FROM settlement_rules')?{month:'0000-01',scope:'month',revision:1,config:JSON.stringify(config)}:null;
  if(result)return {bind(){return {first:async()=>result,all:async()=>({results:[result]})};}};
  if(sql.includes('FROM space_members m'))return {bind(){return {all:async()=>({results:[{user_id:'google-test-id',name:'本人',active:1},{user_id:'partner',name:'相手',active:1}]})};}};
  const original=env.DB?.prepare(sql)??{all:async()=>({results:[]})};
  return {...original,bind(...values){const bound=original.bind?.(...values)??original;return {...bound,all:bound.all??original.all};}};
 }};
 return app.fetch(new Request(request,{headers}),{...env,DB},...rest);
}};
