"""Preview companion portraits without changing identity or creating a chat."""
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .auth import AuthUser, require_user
from .config import get_settings
from .db import SupabaseRepository
from .images import create_image_provider, ImageProviderError, ImageProviderNotConfigured

router = APIRouter(prefix='/v0.2/companions', tags=['companion portraits'])


class PortraitRequest(BaseModel):
    appearance: str = Field(min_length=1, max_length=3000)
    style: str = Field(default='Natural photographic portrait', min_length=1, max_length=300)


@router.post('/{companion_id}/portrait-preview')
async def portrait_preview(companion_id: UUID, request: PortraitRequest,
                           user: AuthUser = Depends(require_user)):
    settings = get_settings()
    db = SupabaseRepository(settings, user.token)
    if not await db.get_companion(str(companion_id)):
        raise HTTPException(404, 'Companion not found')
    if not request.appearance.strip() or not request.style.strip():
        raise HTTPException(422, 'Describe the appearance and style first.')
    prompt = (f'Square companion portrait, one subject, head and shoulders, clear facial details. '
              f'Appearance requested by the user: {request.appearance.strip()}. '
              f'Visual style: {request.style.strip()}. No text, watermark or collage.')
    try:
        result = await create_image_provider(settings).generate(prompt)
    except ImageProviderNotConfigured as exc:
        raise HTTPException(503, str(exc)) from exc
    except (ImageProviderError, httpx.HTTPError) as exc:
        raise HTTPException(502, 'The image service could not generate the portrait. Try again.') from exc
    extension = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'}.get(result.get('mime_type'))
    if extension is None or not result.get('bytes') or len(result['bytes']) > 5 * 1024 * 1024:
        raise HTTPException(502, 'The generated portrait has an unsupported format or exceeds 5 MB.')
    path = f'{user.id}/{uuid4()}.{extension}'
    try:
        await db.upload_storage('companion-portraits', path, result['bytes'], result['mime_type'])
    except httpx.HTTPError as exc:
        raise HTTPException(502, 'The portrait was generated but could not be stored.') from exc
    return {'path': path, 'mime_type': result['mime_type']}
