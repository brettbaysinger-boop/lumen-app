"""Run with python -m lumen.push_worker. Never log tokens or credential content."""
import asyncio
import logging
from pathlib import Path
import httpx
from .config import get_settings
from .db import SupabaseRepository

log = logging.getLogger('lumen.push')

def message(job):
    return {'message': {
        'token':job['token'],
        'notification':{'title':'Raialume','body': 'Your test notification arrived.' if job['kind']=='test' else 'A reminder is ready in My Day.'},
        'data':{'screen':'my-day','owner_id':str(job['owner_user_id']),'job_id':str(job['id'])},
        'android':{'priority':'HIGH','ttl':'3600s','notification':{'channel_id':'raialume-reminders','tag':str(job['id'])}}
    }}

def classify(status, body):
    if 200<=status<300: return 'sent'
    codes = [v.get('errorCode') for v in body.get('error',{}).get('details',[]) if isinstance(v,dict)]
    if 'UNREGISTERED' in codes: return 'invalid'
    if status==429 or status>=500 or status==401: return 'retry'
    return 'failed'

class Sender:
    def __init__(self, settings):
        from google.oauth2 import service_account
        self.credentials=service_account.Credentials.from_service_account_file(
            str(Path(settings.firebase_service_account_file).expanduser()),
            scopes=['https://www.googleapis.com/auth/firebase.messaging'])
        self.lock=asyncio.Lock()
        self.project=self.credentials.project_id
        if not self.project: raise ValueError('Firebase project missing')

    async def send(self, job):
        from google.auth.transport.requests import Request
        async with self.lock:
            if not self.credentials.valid:
                await asyncio.to_thread(self.credentials.refresh, Request())
        async with httpx.AsyncClient(timeout=20) as client:
            response=await client.post(f'https://fcm.googleapis.com/v1/projects/{self.project}/messages:send',
                headers={'Authorization':'Bearer '+self.credentials.token},json=message(job))
        try: body=response.json()
        except ValueError: body={}
        result=classify(response.status_code, body)
        if result!='sent': log.warning('FCM response status=%s outcome=%s',response.status_code,result)
        return result

async def deliver(db, sender, job):
    # Recheck after claiming: devices may be disabled and reminders changed.
    devices=await db._request('GET','push_devices',params={'id':f"eq.{job['device_id']}",
        'owner_user_id':f"eq.{job['owner_user_id']}",'enabled':'eq.true','select':'token,expires_at'})
    from datetime import datetime, timezone
    active=bool(devices) and devices[0]['token']==job['token'] and datetime.fromisoformat(devices[0]['expires_at'].replace('Z','+00:00'))>datetime.now(timezone.utc)
    if active and job['kind']=='reminder':
        items=await db._request('GET','my_day_items',params={'id':f"eq.{job['item_id']}",
            'status':'eq.open','due_at':f"eq.{job['due_at']}",'select':'id,companion_id'})
        active=bool(items)
        if active:
            companion=await db.get_companion(items[0]['companion_id'])
            active=bool(companion) and companion['owner_user_id']==job['owner_user_id']
    result='cancelled'
    if active:
        try: result=await sender.send(job)
        except Exception: result='retry'  # credential/network failure; bounded retry
    await db._request('POST','rpc/finish_push_job',json={
        'p_id':job['id'],'p_claim_id':job['claim_id'],'p_result':result,'p_token':job['token']})
    log.info('Push job outcome: %s',result)

async def run():
    settings=get_settings()
    if not settings.push_enabled or not settings.firebase_service_account_file:
        raise RuntimeError('Enable push and configure the server credential path before starting the worker.')
    sender=Sender(settings); db=SupabaseRepository(settings)
    while True:
        try:
            jobs=await db._request('POST','rpc/claim_push_jobs',json={})
            outcomes=await asyncio.gather(*(deliver(db,sender,job) for job in jobs),return_exceptions=True)
            if any(isinstance(v,Exception) for v in outcomes): log.warning("Some push jobs await lease recovery.")
        except Exception:
            log.warning('Push worker could not complete this poll; retrying.')
        await asyncio.sleep(15)

if __name__=='__main__':
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
