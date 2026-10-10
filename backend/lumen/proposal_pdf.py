"""Owner-scoped, revalidated proposal PDF export. No inference or persistence."""
import asyncio
import io
import json
import re
from pathlib import Path
from uuid import UUID
from xml.sax.saxutils import escape
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from .auth import AuthUser, require_user
from .document_actions import draft_message
from .document_work import validate_proposal, work_request
from .my_day import companion_db, DocumentSource

router = APIRouter(prefix='/v0.6/documents', tags=['proposal-pdf'])

class ProposalPDFRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1,max_length=200)
    body: str = Field(min_length=1,max_length=6000)


def render_proposal_pdf(title, body, sources):
    # Import on export only; ordinary chat does not initialize the renderer.
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
    out=io.BytesIO()
    green=colors.HexColor('#22583B')
    normal=ParagraphStyle('body',fontName='Helvetica',fontSize=10,leading=14,spaceAfter=6)
    heading=ParagraphStyle('heading',parent=normal,fontName='Helvetica-Bold',fontSize=12,leading=16,textColor=green,spaceBefore=10)
    title_style=ParagraphStyle('title',parent=heading,fontSize=16,leading=20)
    def text(value):
        # Never interpret user-supplied HTML or fetch URLs/images from body text.
        value=escape(value)
        value=re.sub(r'\*\*([^*]+)\*\*',r'<b>\1</b>',value)
        return value
    story=[Paragraph(text(title),title_style),Paragraph('REVIEW DRAFT - confirm scope, prices, service terms and unresolved details before use.',normal),Spacer(1,8)]
    for line in body.splitlines():
        if not line.strip():
            story.append(Spacer(1,5));continue
        match=re.match(r'^\s*#{1,6}\s+(.+)$',line)
        if match:story.append(Paragraph(text(match[1]),heading))
        else:story.append(Paragraph(text(line),normal))
    story += [PageBreak(),Paragraph('Source references for review',heading),Paragraph('These references identify the excerpts used for this draft. They do not independently verify each claim. Original excerpt text is not copied into this PDF.',normal)]
    for source in sources:
        story.append(Paragraph(text(f"[{source['number']}] {source['title']} - page {source['page']}"),normal))
    logo=Path(__file__).parent/'assets'/'rattlesnake-logo.png'
    def decorate(canvas,doc):
        canvas.saveState();canvas.setFillColor(green)
        if logo.is_file():canvas.drawImage(str(logo),40,725,width=25,height=33,preserveAspectRatio=True,mask='auto')
        canvas.setFont('Helvetica-Bold',11);canvas.drawString(76,750,'RATTLESNAKE EXTERMINATING')
        canvas.setFont('Helvetica',7);canvas.drawString(76,738,'Tucson / Southeastern Arizona | AZ License #8871')
        canvas.drawString(76,727,'2302 S 4th Avenue, Tucson, AZ 85713')
        canvas.drawRightString(572,750,'520-499-0899');canvas.drawRightString(572,738,'estimates@wekillbugsdeadaz.com');canvas.drawRightString(572,727,'wekillbugsdeadaz.com')
        canvas.setStrokeColor(green);canvas.line(40,713,572,713)
        canvas.setFont('Helvetica',7);canvas.drawCentredString(306,27,f'REVIEW DRAFT | Rattlesnake Exterminating | Page {doc.page}')
        canvas.restoreState()
    SimpleDocTemplate(out,pagesize=letter,leftMargin=40,rightMargin=40,topMargin=96,bottomMargin=48,title='Proposal review draft',author='Rattlesnake Exterminating').build(story,onFirstPage=decorate,onLaterPages=decorate)
    return out.getvalue()


@router.post('/companions/{companion_id}/drafts/{message_id}/pdf')
async def export_proposal_pdf(companion_id:UUID,message_id:UUID,payload:ProposalPDFRequest,user:AuthUser=Depends(require_user)):
    db=await companion_db(str(companion_id),user)
    message=await draft_message(db,str(companion_id),message_id)
    if message['metadata']['document_action_draft'].get('kind')!='note':
        raise HTTPException(422,'PDF export is available for proposal note drafts only.')
    stamps=await db._request('GET','messages',params={'id':f'eq.{message_id}','companion_id':f'eq.{companion_id}','role':'eq.assistant','select':'created_at','limit':'1'})
    if not stamps:raise HTTPException(404,'Proposal message unavailable.')
    requests=await db._request('GET','messages',params={'conversation_id':f"eq.{message['conversation_id']}",'companion_id':f'eq.{companion_id}','role':'eq.user','created_at':f"lte.{stamps[0]['created_at']}",'select':'content','order':'created_at.desc','limit':'1'})
    if not requests or not work_request(requests[0].get('content','')):
        raise HTTPException(422,'This message is not a proposal workflow draft.')
    try:
        sources=[DocumentSource.model_validate(s).model_dump(mode='json') for s in message['metadata'].get('document_sources',[])]
        if not sources or len(sources)>6:raise ValueError()
    except ValueError:
        raise HTTPException(422,'Saved source references are invalid.') from None
    for source in sources:
        documents=await db._request('GET','documents',params={'id':f"eq.{source['document_id']}",'companion_id':f'eq.{companion_id}','select':'id','limit':'1'})
        if not documents:raise HTTPException(404,'A source document is unavailable.')
    try:
        final=validate_proposal(json.dumps({'title':payload.title,'body':payload.body}),sources,requests[0]['content'])
    except ValueError:
        raise HTTPException(422,'Edited proposal failed source or price checks. Keep valid citations and prices from the original request or excerpts.') from None
    try:
        data=await asyncio.to_thread(render_proposal_pdf,final.title,final.body,sources)
    except Exception:
        # No private exception bodies or draft content in logs or response.
        raise HTTPException(503,'PDF rendering is unavailable. Check the backend PDF dependency.') from None
    return Response(data,media_type='application/pdf',headers={'Content-Disposition':'attachment; filename="proposal-review-draft.pdf"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
