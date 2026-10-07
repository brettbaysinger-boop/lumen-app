"""Account support only. Never use privileged credentials for companion data."""
from uuid import UUID, uuid4
from datetime import datetime, timezone
from urllib.parse import urlparse
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from .auth import AuthUser, require_user
from .config import get_settings

router = APIRouter(prefix='/v0.4/support', tags=['support'])


def is_support(user):
    return user.id in {value.strip() for value in get_settings().support_admin_user_ids.split(',') if value.strip()}


async def require_support(user: AuthUser = Depends(require_user)):
    if not is_support(user): raise HTTPException(403, 'Account support access is required.')
    return user


async def request(method, path, **kwargs):
    settings = get_settings()
    headers={'apikey':settings.supabase_service_role_key, 'Authorization':'Bearer '+settings.supabase_service_role_key}
    headers.update(kwargs.pop('headers', {}))
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response=await client.request(method, settings.supabase_url.rstrip('/')+path, headers=headers, **kwargs)
        if response.status_code == 404: raise HTTPException(404, 'Account not found.')
        if response.status_code == 429: raise HTTPException(429, 'Please wait before requesting recovery again.')
        response.raise_for_status()
        return response.json() if response.content else {}
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(503, 'Account support service is unavailable. No private details were returned.') from exc


def account(row):
    # Explicit allowlist: do not forward metadata, identities, tokens, or links.
    return {key:row.get(key) for key in ('id','email','created_at','last_sign_in_at','email_confirmed_at','banned_until')}


@router.get('/me')
async def me(user: AuthUser = Depends(require_user)):
    return {'user_id':user.id, 'enabled':is_support(user)}


@router.get('/accounts')
async def accounts(page: int = Query(default=1, ge=1, le=100000), user: AuthUser = Depends(require_support)):
    body=await request('GET','/auth/v1/admin/users',params={'page':page,'per_page':25})
    return {'accounts':[account(row) for row in body.get('users',[])], 'page':page}


async def action(user, target, kind):
    body=await request('GET',f'/auth/v1/admin/users/{target}')
    row=body.get('user',body)
    if str(row.get('id')) != str(target): raise HTTPException(502,'Account service returned an invalid account.')
    redirect=get_settings().support_recovery_redirect_url
    if kind=='recovery':
        parsed=urlparse(redirect)
        if parsed.scheme not in ('http','https') or not parsed.netloc or parsed.username or parsed.password or parsed.path!='/recover' or parsed.query or parsed.fragment:
            raise HTTPException(503,'Configure SUPPORT_RECOVERY_REDIRECT_URL to the approved Lumen /recover address.')
        if not row.get('email'): raise HTTPException(400,'This account has no recovery email.')
    event=str(uuid4())
    await request('POST','/rest/v1/support_audit',headers={'Prefer':'return=minimal'},json={
        'id':event,'actor_user_id':user.id,'target_user_id':str(target),'action':kind,'status':'requested'})
    try:
        if kind=='unlock':
            await request('PUT',f'/auth/v1/admin/users/{target}',json={'ban_duration':'none'})
        else:
            # Ask Auth to send email. Never generate or return a recovery token.
            await request('POST','/auth/v1/recover',params={'redirect_to':redirect},json={'email':row['email']})
    except HTTPException:
        await request('PATCH','/rest/v1/support_audit',params={'id':f'eq.{event}'},headers={'Prefer':'return=minimal'},
                      json={'status':'failed','finished_at':datetime.now(timezone.utc).isoformat()})
        raise
    try:
        await request('PATCH','/rest/v1/support_audit',params={'id':f'eq.{event}'},headers={'Prefer':'return=minimal'},
                      json={'status':'accepted','finished_at':datetime.now(timezone.utc).isoformat()})
    except HTTPException as exc:
        raise HTTPException(503,'The account action was accepted, but audit completion failed. Check the audit log before retrying.') from exc
    return {'accepted':True,'action':kind,'audit_id':event}


@router.post('/accounts/{target}/unlock')
async def unlock(target: UUID, user: AuthUser = Depends(require_support)):
    return await action(user,target,'unlock')


@router.post('/accounts/{target}/recovery')
async def recovery(target: UUID, user: AuthUser = Depends(require_support)):
    return await action(user,target,'recovery')


@router.get('/audit')
async def audit(user: AuthUser = Depends(require_support)):
    return await request('GET','/rest/v1/support_audit',params={
        'select':'id,actor_user_id,target_user_id,action,status,created_at,finished_at','order':'created_at.desc','limit':'100'})
