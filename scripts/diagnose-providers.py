"""Read-only provider inventory. Run from the backend venv; never loads a model."""
import argparse
import json
import time
from pathlib import Path
from urllib.request import urlopen
from datetime import datetime, timezone
from lumen.config import Settings
from lumen.providers import endpoint_host

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--heavy-ollama',help='Optional Heavy Ollama base URL for its loaded-model inventory')
parser.add_argument('--samples',type=int,choices=range(1,7),default=1)
args=parser.parse_args()
settings=Settings(_env_file=Path(__file__).resolve().parents[1]/'backend'/'.env')
print('Configured conversation/vision:',endpoint_host(settings.ollama_url))
print('Configured image generation:',settings.image_provider,endpoint_host(settings.comfyui_url))
print('Configured speech:',endpoint_host(settings.speech_url),'(not probed)')
print('Loaded models are server inventory, not proof that Raialume used them.')

def read(base,path,label):
    if endpoint_host(base)=='Not configured':
        print(label+': not configured');return None
    try:
        with urlopen(base.rstrip('/')+path,timeout=5) as response:return json.load(response)
    except Exception as error:
        print(label+': '+type(error).__name__+(' HTTP '+str(error.code) if hasattr(error,'code') else ''))
        return None

for index in range(args.samples):
    print('\nSample',index+1,datetime.now(timezone.utc).isoformat())
    targets=[('Conversation Ollama',settings.ollama_url)]
    if args.heavy_ollama:targets.append(('Heavy Ollama',args.heavy_ollama))
    for label,base in targets:
        data=read(base,'/api/ps',label)
        if data is not None:
            print(label,json.dumps([{'model':row.get('name'),'size_bytes':row.get('size'),
                'vram_bytes':row.get('size_vram'),'context_length':row.get('context_length')} for row in data.get('models',[])]))
    if settings.image_provider=='comfyui':
        data=read(settings.comfyui_url,'/system_stats','ComfyUI')
        if data is not None:
            for row in data.get('devices',[]):
                print('ComfyUI device',json.dumps({key:row.get(key) for key in ('name','vram_total','vram_free','torch_vram_total','torch_vram_free')}))
    if index+1<args.samples:time.sleep(5)
