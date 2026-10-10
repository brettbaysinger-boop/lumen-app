"""Configured routes and bounded request provenance; never infer GPU execution."""
import time
from urllib.parse import urlsplit
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from .auth import AuthUser, require_user
from .config import get_settings
from .my_day import companion_db

router = APIRouter(prefix='/v0.9/providers', tags=['providers'])


def endpoint_host(value):
    """Expose only hostname/port, never credentials, paths or query tokens."""
    if not isinstance(value,str): return 'Not configured'
    try:
        parsed=urlsplit(value)
        if parsed.scheme not in ('http','https') or not parsed.hostname: return 'Not configured'
        host=parsed.hostname
        if ':' in host: host=f'[{host}]'
        return host+(f':{parsed.port}' if parsed.port else '')
    except ValueError: return 'Not configured'


def setting(settings,key,default=''):
    value=getattr(settings,key,default)
    return value if isinstance(value,str) else default


def request_record(settings,kind,model,status,elapsed,provider='ollama',endpoint=None):
    return {'kind':kind,'provider':provider,'endpoint':endpoint_host(endpoint if endpoint is not None else setting(settings,'ollama_url')),
            'model':model if isinstance(model,str) else 'Unknown', 'status':status,
            'duration_ms':max(0,round(elapsed*1000))}


class RecordingProvider:
    """Per-turn proxy; preserves the real provider and records only inference calls."""
    def __init__(self,provider,settings,records):
        self.provider,self.settings,self.records=provider,settings,records
    def __getattr__(self,name): return getattr(self.provider,name)
    async def _call(self,method,model,messages,*args,**kwargs):
        started=time.perf_counter();status='failed';actual=model
        try:
            result=await getattr(self.provider,method)(model,messages,*args,**kwargs)
            status='completed'
            if isinstance(result,dict): actual=result.get('model',model)
            return result
        finally:
            kind='vision' if any(message.get('images') for message in messages) else 'structured' if method=='structured' else 'text'
            base=getattr(self.provider,'base_url',None)
            self.records.append(request_record(self.settings,kind,actual,status,time.perf_counter()-started,
                endpoint=base if isinstance(base,str) else None))
    async def generate(self,model,messages,*args,**kwargs): return await self._call('generate',model,messages,*args,**kwargs)
    async def generate_stream(self,model,messages,*args,**kwargs): return await self._call('generate_stream',model,messages,*args,**kwargs)
    async def structured(self,model,messages,*args,**kwargs): return await self._call('structured',model,messages,*args,**kwargs)


@router.get('/companions/{cid}')
async def routes(cid:UUID,user:AuthUser=Depends(require_user)):
    db=await companion_db(str(cid),user)
    companion=await db.get_companion(str(cid))
    if not companion: raise HTTPException(404,"Companion not found.")
    settings=get_settings()
    model=companion.get('conversation_model') or settings.conversation_model
    def row(capability,provider,url,model,note):
        host=endpoint_host(url)
        return {'capability':capability,'provider':provider,'endpoint':host,'model':model,
                'configured':host!='Not configured','note':note}
    return {'routes':[
        row('Conversation','Ollama',settings.ollama_url,model,'Selected conversation model.'),
        row('Photo understanding','Ollama',settings.ollama_url,model,'Uses the conversation route when the selected model supports images.'),
        row('Memory extraction','Ollama',settings.ollama_url,settings.memory_observation_model or model,
            'Automatic observations enabled.' if settings.memory_observations_enabled else 'Automatic observations disabled.'),
        row('Image generation',settings.image_provider,settings.comfyui_url,'ComfyUI workflow','Workflow-defined model; no GPU assignment is inferred.'),
        row('Speech recognition','Helios',settings.speech_url,settings.transcription_model,'Existing speech configuration.'),
        row('Speech synthesis','Helios',settings.speech_url,settings.speech_model,'Existing speech configuration.'),
    ],'note':'Configured routes, not live health or GPU utilization. Request details on new replies show calls actually made.'}
