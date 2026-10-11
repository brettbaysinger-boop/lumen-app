"""Authenticated installation registration. Delivery runs in a separate worker."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from .auth import AuthUser, require_user
from .config import get_settings
from .db import SupabaseRepository

router = APIRouter(prefix='/v0.4/push', tags=['push'])

class Registration(BaseModel):
    device_id: UUID
    enabled: bool = True
    token: str = Field(min_length=20, max_length=4096)

class Device(BaseModel):
    device_id: UUID

async def rpc(user, name, payload):
    try:
        return await SupabaseRepository(get_settings(), user.token)._request(
            'POST', 'rpc/'+name, json=payload)
    except Exception as exc:
        # Never expose provider responses, device tokens or SQL details.
        raise HTTPException(503, 'Notification setup could not be updated. Check connectivity and retry.') from exc

@router.post('/register')
async def register(payload: Registration, user: AuthUser = Depends(require_user)):
    if not get_settings().push_enabled:
        raise HTTPException(503, 'Notifications are not enabled on this server yet.')
    await rpc(user, 'register_push_device', {'p_device_id':str(payload.device_id),'p_token':payload.token,'p_enabled':payload.enabled})
    return {'enabled':True}

@router.post('/disable')
async def disable(payload: Device, user: AuthUser = Depends(require_user)):
    await rpc(user, 'disable_push_device', {'p_device_id':str(payload.device_id)})
    return {'enabled':False}

@router.post('/test')
async def test(payload: Device, user: AuthUser = Depends(require_user)):
    if not get_settings().push_enabled:
        raise HTTPException(503, 'Notifications are not enabled on this server yet.')
    await rpc(user, 'test_push_device', {'p_device_id':str(payload.device_id)})
    return {'queued':True}
