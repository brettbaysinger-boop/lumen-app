"""Verify every user token with local Supabase Auth; never trust a supplied user ID."""
from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthUser:
    id: str
    token: str


async def require_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> AuthUser:
    if not credentials or credentials.scheme.lower() != 'bearer':
        raise HTTPException(401, 'Sign in to Lumen first.')
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(settings.supabase_url.rstrip('/') + '/auth/v1/user',
                headers={'apikey': settings.supabase_service_role_key,
                         'Authorization': 'Bearer ' + credentials.credentials})
        if response.status_code in (401, 403):
            raise HTTPException(401, 'Your session expired. Sign in again.')
        response.raise_for_status()
        user = response.json()
        if not isinstance(user, dict) or not user.get('id') or user.get('is_anonymous'):
            raise HTTPException(401, 'A registered account is required.')
        return AuthUser(user['id'], credentials.credentials)
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(503, 'Local login service is unavailable.') from exc
