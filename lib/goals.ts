import { authHeaders } from './auth';
export interface GoalProfile {level:'beginner'|'intermediate'|'advanced';focus:string;minutes:number;cadence:'daily'|'weekly'|'flexible'}
export interface GoalSession {id:string;item_id:string;companion_id:string;conversation_id:string;status:'open'|'completed';profile:Partial<GoalProfile>;summary:string;practice_notes:string;vocabulary:string;next_step:string;started_at:string;ended_at:string|null}
export async function goalRequest<T>(cid:string,path='',method='GET',body?:unknown):Promise<T>{
 const base=process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/,'');if(!base)throw new Error('Lumen API address is missing.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{const response=await fetch(`${base}/v0.7/goals/companions/${encodeURIComponent(cid)}${path}`,{method,headers:{'Content-Type':'application/json',...await authHeaders()},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});
 const result=await response.json();if(!response.ok)throw new Error(typeof result.detail==='string'?result.detail:'Could not update practice. Check the latest migration and API.');return result;
 }catch(error){if(controller.signal.aborted)throw new Error('Practice request timed out. Reload before retrying.');throw error;}finally{clearTimeout(timer);}
}
