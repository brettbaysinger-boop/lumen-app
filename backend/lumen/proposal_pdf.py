"""Owner-scoped, revalidated proposal PDF export. No inference or persistence."""
import asyncio
import json
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from .auth import AuthUser, require_user
from .document_actions import draft_message
from .document_work import validate_proposal, work_request
from .proposal_context import proposal_request, previous_request
from .my_day import companion_db, DocumentSource
from .proposal_pdf_layout import render_proposal_pdf

router = APIRouter(prefix='/v0.6/documents', tags=['proposal-pdf'])

class ProposalPDFRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1,max_length=200)
    body: str = Field(min_length=1,max_length=6000)
    use_saved_style: bool = False



@router.post('/companions/{companion_id}/drafts/{message_id}/pdf')
async def export_proposal_pdf(companion_id:UUID,message_id:UUID,payload:ProposalPDFRequest,user:AuthUser=Depends(require_user)):
    db=await companion_db(str(companion_id),user)
    message=await draft_message(db,str(companion_id),message_id)
    if message['metadata']['document_action_draft'].get('kind')!='note':
        raise HTTPException(422,'PDF export is available for proposal note drafts only.')
    stamps=await db._request('GET','messages',params={'id':f'eq.{message_id}','companion_id':f'eq.{companion_id}','role':'eq.assistant','select':'created_at','limit':'1'})
    if not stamps:raise HTTPException(404,'Proposal message unavailable.')
    context = message['metadata'].get('document_work_context')
    params = {'conversation_id':f"eq.{message['conversation_id']}",'companion_id':f'eq.{companion_id}','role':'eq.user','created_at':f"lte.{stamps[0]['created_at']}",'select':'id,content,created_at','order':'created_at.desc','limit':'1'}
    if context is not None:
        try:
            if not isinstance(context, dict) or context.get('version') != 1:
                raise ValueError()
            params['id'] = 'eq.' + str(UUID(context['request_message_id']))
        except (ValueError, KeyError, TypeError, AttributeError):
            raise HTTPException(422,'Saved proposal context is invalid.') from None
    requests=await db._request('GET','messages',params=params)
    if not requests or not work_request(requests[0].get('content','')):
        raise HTTPException(422,'This message is not a proposal workflow draft.')
    validation_request = requests[0]['content']
    if context is not None and context.get('previous_user_message_id') is not None:
        try:
            previous_id = str(UUID(context['previous_user_message_id']))
            if previous_id == requests[0]['id']:
                raise ValueError()
            previous_rows = await db._request('GET','messages',params={
                'id':'eq.' + previous_id, 'conversation_id':f"eq.{message['conversation_id']}",
                'companion_id':f'eq.{companion_id}', 'role':'eq.user',
                'created_at':f"lt.{requests[0]['created_at']}",
                'select':'id,role,content', 'limit':'1'})
            previous = previous_request(requests[0]['content'], previous_rows)
            if previous is None or previous['id'] != previous_id:
                raise ValueError()
            validation_request = proposal_request(requests[0]['content'], previous['content'])
        except (ValueError, KeyError, TypeError, AttributeError):
            raise HTTPException(422,'The earlier job request is unavailable. Create a new draft with the full job details.') from None
    try:
        sources=[DocumentSource.model_validate(s).model_dump(mode='json') for s in message['metadata'].get('document_sources',[])]
        if not sources or len(sources)>6:raise ValueError()
    except ValueError:
        raise HTTPException(422,'Saved source references are invalid.') from None
    for source in sources:
        documents=await db._request('GET','documents',params={'id':f"eq.{source['document_id']}",'companion_id':f'eq.{companion_id}','select':'id','limit':'1'})
        if not documents:raise HTTPException(404,'A source document is unavailable.')
    try:
        final=validate_proposal(json.dumps({'title':payload.title,'body':payload.body}),sources,validation_request)
    except ValueError:
        raise HTTPException(422,'Edited proposal failed source or price checks. Keep valid citations and prices from the original request or excerpts.') from None
    style_options = {}
    if payload.use_saved_style:
        from .document_style import load_style
        try:
            style_options['style'] = await load_style(user)
        except Exception:
            raise HTTPException(503, 'Your saved document style is unavailable. Try again after checking the document-style service.') from None
    try:
        data=await asyncio.to_thread(render_proposal_pdf,final.title,final.body,sources,**style_options)
    except Exception:
        # No private exception bodies or draft content in logs or response.
        raise HTTPException(503,'PDF rendering is unavailable. Check the backend PDF dependency.') from None
    return Response(data,media_type='application/pdf',headers={'Content-Disposition':'attachment; filename="proposal-review-draft.pdf"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
