import { notifySessionExpired } from './auth';
export type Api = <T>(path:string,options?:RequestInit)=>Promise<T>;
export function spaceApi(spaceId?:string):Api {
 return async<T>(path:string,options?:RequestInit):Promise<T>=>{
  const response=await fetch(`/api${path}`,{...options,headers:{'Content-Type':'application/json',...(spaceId?{'X-Space-Id':spaceId}:{}),...options?.headers},cache:'no-store'});
  notifySessionExpired(response);
  if(!response.ok){const data=await response.json().catch(()=>({})) as {error?:string};throw Object.assign(new Error(data.error||'通信に失敗しました'),{status:response.status});}
  return response.json();
 };
}
