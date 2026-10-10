"""Read-only synthetic provider probe; all repository reads/writes are mocked.
Run from backend: .venv/bin/python ../scripts/test-memory-corrections-model.py --model MODEL
"""
import argparse
import asyncio
from unittest.mock import AsyncMock, Mock
from lumen.config import get_settings
from lumen.ollama import OllamaProvider
from lumen.memory_corrections import correct_memory, correction_candidate

async def main(model):
    settings=get_settings()
    cases=[
      ('direct','Actually, my favorite color is blue','correct'),
      ('contextual',"No, it's blue",'correct'),
      ('missing-value',"That's wrong",'clarify'),
      ('temporal',"It used to be red; now it's blue",'change'),
      ('casual','Actually, I like this blue shirt','none'),
      ('negative',"Actually, my favorite color isn't red",'clarify'),
      ('hypothetical','Actually, if my favorite color were blue','skip'),
    ]
    failures=[]
    for label,message,expected in cases:
        writes=[]
        target={'id':'11111111-1111-4111-8111-111111111111','content':'My favorite color is red',
                'subject':'user','is_active':True,'revision_version':0,'tags':['topic:favorite_color']}
        async def request(method,table,**kwargs):
            if table=='memory_revisions':return []
            if table=='memories':return [target]
            if table=='rpc/correct_user_memory':
                payload=kwargs['json'];writes.append(payload)
                return {'id':'synthetic-receipt','kind':payload['p_kind'],'after_content':payload['p_after'],'undone_at':None}
            raise AssertionError(table)
        db=Mock(_request=AsyncMock(side_effect=request))
        if not correction_candidate(message):
            ok=expected=='skip';result=None
        else:
            result=await correct_memory(db,'synthetic-companion','synthetic-chat',message,
                [{'role':'assistant','content':'Your favorite color is red.'}],
                OllamaProvider(settings),model,'synthetic-request')
            if expected in ('correct','change'):
                ok=len(writes)==1 and writes[0]['p_after'].casefold().rstrip('.')=='my favorite color is blue' and writes[0]['p_kind']==('change' if expected=='change' else 'correction')
            elif expected=='none':ok=result is None and not writes
            else:ok=bool(result and result.get('memory_correction_pending')) and not writes
        print(f'{label}: {"PASS" if ok else "FAIL"}; simulated writes={len(writes)}',flush=True)
        if not ok:
            failures.append(label);print('Synthetic result:',result,flush=True)
    if failures:raise SystemExit('Probe failures: '+', '.join(failures))
    print('All synthetic correction probes passed; no database connection or write was made.')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--model',required=True)
    asyncio.run(main(p.parse_args().model))
