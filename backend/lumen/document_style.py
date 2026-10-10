"""Owner-private logo/layout preferences; example text never becomes evidence."""
import asyncio
import base64
import json
import subprocess
import sys
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from .auth import AuthUser, require_user
from .config import get_settings
from .db import SupabaseRepository
from .document_style_model import DocumentStyle, normalize_logo

router = APIRouter(prefix='/v0.6/document-style', tags=['document-style'])


async def style_user(user: AuthUser = Depends(require_user),
                     x_document_style_owner: str | None = Header(default=None)):
    # A request started before an account switch must not save the old form
    # under the newly authenticated account. This header never grants access.
    if x_document_style_owner is not None and x_document_style_owner != user.id:
        raise HTTPException(409, 'Account changed. Reopen your document style.')
    return user


def repository(user):
    return SupabaseRepository(get_settings(), user.token)


async def load_style(user):
    rows = await repository(user)._request('GET', 'document_styles', params={
        'owner_user_id': 'eq.' + user.id, 'select': 'settings', 'limit': '1'})
    return DocumentStyle.model_validate(rows[0]['settings']) if rows else DocumentStyle()


@router.get('')
async def get_style(user: AuthUser = Depends(style_user)):
    try:
        style = await load_style(user)
    except Exception:
        raise HTTPException(503, 'Document style is unavailable. Check the document-style migration.') from None
    return style.model_dump()


@router.put('')
async def save_style(style: DocumentStyle, user: AuthUser = Depends(style_user)):
    try:
        rows = await repository(user)._request('POST', 'document_styles',
            params={'on_conflict': 'owner_user_id', 'select': 'settings'},
            headers={'Prefer': 'resolution=merge-duplicates,return=representation'},
            json={'owner_user_id': user.id, 'settings': style.model_dump()})
        if not rows:
            raise ValueError()
        result = DocumentStyle.model_validate(rows[0]['settings'])
    except Exception:
        raise HTTPException(503, 'Document style could not be saved.') from None
    return result.model_dump()


@router.delete('')
async def delete_style(user: AuthUser = Depends(style_user)):
    try:
        await repository(user)._request('DELETE', 'document_styles',
            params={'owner_user_id': 'eq.' + user.id})
    except Exception:
        raise HTTPException(503, 'Document style could not be removed.') from None
    return {'deleted': True}


@router.post('/logo')
async def upload_logo(file: UploadFile = File(...), user: AuthUser = Depends(style_user)):
    try:
        raw = await file.read(4 * 1024 * 1024 + 1)
        result = await asyncio.to_thread(normalize_logo, raw)
        return {'logo_png': base64.b64encode(result).decode('ascii')}
    except Exception:
        raise HTTPException(422, 'Choose a still PNG, JPG or WebP logo up to 4 MB and 4 megapixels.') from None
    finally:
        await file.close()


def inspect_worker(raw):
    try:
        process = subprocess.run([sys.executable, '-B', '-m', 'lumen.document_style_probe'],
                                 input=raw, capture_output=True, timeout=15)
        result = json.loads(process.stdout)
        if process.returncode or 'settings' not in result:
            raise ValueError()
        # Allow only visual fields even if the worker ever changes.
        keys = {'page_size', 'spacing', 'accent'}
        if set(result['settings']) - keys:
            raise ValueError()
        DocumentStyle.model_validate(result['settings'])
        return result
    except Exception:
        raise ValueError('Example could not be analyzed. Use a text-based portrait PDF up to 8 MB and 20 pages.') from None


@router.post('/examples')
async def examples(files: list[UploadFile] = File(...), user: AuthUser = Depends(style_user)):
    try:
        if not 1 <= len(files) <= 2:
            raise HTTPException(422, 'Choose one or two PDF examples.')
        results = []
        for file in files:
            raw = await file.read(8 * 1024 * 1024 + 1)
            if not raw or len(raw) > 8 * 1024 * 1024:
                raise HTTPException(413, 'Each example must be a nonempty PDF up to 8 MB.')
            try:
                results.append(await asyncio.to_thread(inspect_worker, raw))
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from None
        settings = dict(results[0]['settings'])
        conflicts = []
        if len(results) == 2:
            for key in set(settings) | set(results[1]['settings']):
                second = results[1]['settings'].get(key)
                if key not in settings and second is not None:
                    settings[key] = second
                elif second is not None and settings[key] != second:
                    conflicts.append(key)
        return {'settings': settings, 'conflicts': sorted(conflicts),
                'examples_analyzed': len(results)}
    finally:
        for file in files:
            await file.close()


@router.post('/preview')
async def preview(style: DocumentStyle, user: AuthUser = Depends(style_user)):
    from .proposal_pdf_layout import render_proposal_pdf
    body = ('## Customer Information\nCustomer: Example Customer\nAddress: 123 Example Street\n'
            '## Scope of Services\nWork agreed for this example project. [1]\n'
            '## Investment\nService: $100\nOptional add-on: $25, only if selected\n'
            '## Terms\nExample terms for preview only. [1]\n'
            '## Acceptance\nSignature: ____________________\nDate: ____________________')
    try:
        data = await asyncio.to_thread(render_proposal_pdf, 'Document style preview', body,
            [{'number': 1, 'document_id': 'example', 'page': 1}], style=style)
    except Exception:
        raise HTTPException(503, 'Style preview could not be rendered.') from None
    return Response(data, media_type='application/pdf', headers={
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})
