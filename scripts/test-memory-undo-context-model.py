"""Synthetic same-chat Undo and current-memory probe. Database and chat writes are mocked.
Run from backend: .venv/bin/python ../scripts/test-memory-undo-context-model.py --model MODEL
"""
import argparse
import asyncio
import re
from unittest.mock import AsyncMock, Mock
from lumen.config import get_settings
from lumen.ollama import OllamaProvider
from lumen.runtime import CognitionRuntime

RID='11111111-1111-4111-8111-111111111111'
MID='22222222-2222-4222-8222-222222222222'
CID='33333333-3333-4333-8333-333333333333'
CHAT='44444444-4444-4444-8444-444444444444'
MEMORY={'id':MID,'content':'My favorite season is summer.','subject':'user',
        'type':'preference','is_active':True,'revision_version':2}
REVISION={'id':RID,'memory_id':MID,'after_content':'my favorite time is autumn',
          'applied_version':1,'undone_at':'2026-10-10T19:00:00Z'}
HISTORY=[
 {'role':'assistant','content':'Do you mean your favorite season, or a different time? I haven’t changed a memory.'},
 {'role':'user','content':'My favorite time is morning.'},
 {'role':'assistant','content':'Thanks for correcting me. I’ve updated that memory to: my favorite time is autumn',
  'metadata':{'memory_revision':{'id':RID,'kind':'correction'}}},
 {'role':'user','content':'yes'},
 {'role':'assistant','content':'I have “My favorite season is summer.” saved. Replace it with “my favorite time is autumn”?'},
 {'role':'user','content':'my favorite time is autumn'},
]
async def main(model):
    settings=get_settings().model_copy(update={'memory_observations_enabled':False})
    failed=[]
    for label,question,history,inactive in (
        ('same-chat after Undo',"What's my favorite time of year?",HISTORY,False),
        ('certainty after stale answer','Are you sure?',
         [{'role':'assistant','content':'Your favorite time of year is autumn.'},
          {'role':'user','content':"What's my favorite time of year?"}]+HISTORY,False),
        ('deleted memory with old history',"What's my favorite time of year?",HISTORY,True),
        ('ordinary conversation after Undo',
         "Explain what you currently have saved about my preferences and whether the earlier correction still applies.",HISTORY,False),
    ):
        memory={**MEMORY,'is_active':not inactive}
        async def request(method,table,**kwargs):
            if method=='GET' and table=='memory_revisions': return [REVISION]
            if method=='GET' and table=='memories': return [memory]
            raise AssertionError('Unexpected repository operation: '+method+' '+table)
        runtime=CognitionRuntime.__new__(CognitionRuntime)
        runtime.settings=settings
        runtime.provider=OllamaProvider(settings)
        runtime.db=Mock(
            get_companion=AsyncMock(return_value={'name':'Lumen','conversation_model':model}),
            get_conversation=AsyncMock(return_value={'id':CHAT}),
            get_state=AsyncMock(return_value={}),
            get_relevant_memories=AsyncMock(return_value=[] if inactive else [memory]),
            get_recent_messages=AsyncMock(return_value=history),
            create_message=AsyncMock(return_value={'id':'synthetic-message'}),
            touch_conversation=AsyncMock(),remember=AsyncMock(side_effect=AssertionError('No memory write allowed')),
            _request=AsyncMock(side_effect=request),
        )
        result=await runtime.respond(CID,CHAT,question)
        print('\n'+label+' synthetic answer:\n'+result.content,flush=True)
        answer=result.content.casefold()
        if inactive:
            ok=bool(re.search(r"(?:no (?:current |active )?saved|not (?:currently )?(?:saved|recorded)|"
                              r"don[’']t have|do not have|removed|deleted|no longer (?:saved|recorded)|"
                              r"isn[’']t (?:currently )?(?:saved|recorded))",answer))
        else:
            ok='summer' in answer and not re.search(
                r"(?:favorite (?:time of year|season) is autumn|"
                r"autumn (?:is|remains) your (?:current )?favorite)",answer)
        count=len(runtime.db.create_message.call_args_list[1].args[0]['metadata']['provider_requests'])
        print('Provider calls for this reply:',count,flush=True)
        expected_provider = label == 'ordinary conversation after Undo'
        ok = ok and (count > 0 if expected_provider else count == 0)
        print(('PASS' if ok else 'FAIL')+': bounded answer indicators; inspect the printed answer.',flush=True)
        runtime.db.remember.assert_not_awaited()
        if not ok:failed.append(label)
    if failed:raise SystemExit('Probe failures: '+', '.join(failed))
    print('\nAll bounded indicators passed. No database connection or real writes were made.')
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--model',required=True)
    asyncio.run(main(parser.parse_args().model))
