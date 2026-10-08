import { authHeaders } from './auth';
export interface SmallPlan {title:string;body:string;steps:string[]}
export async function unstuckRequest<T>(cid:string,path:string,method='GET',body?:unknown):Promise<T>{
 const base=process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/,'');if(!base)throw new Error('Lumen API address is missing.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{const response=await fetch(`${base}/v0.8/unstuck/companions/${encodeURIComponent(cid)}${path}`,{method,headers:{'Content-Type':'application/json',...await authHeaders()},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});
 const value=await response.json();if(!response.ok)throw new Error(typeof value.detail==='string'?value.detail:'Could not update this plan.');return value;
 }catch(error){if(controller.signal.aborted)throw new Error('Plan request timed out. Reload before retrying.');throw error;}finally{clearTimeout(timer);}
}
