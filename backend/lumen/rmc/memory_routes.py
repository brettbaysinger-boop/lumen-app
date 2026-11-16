"""Authenticated RMC-only memory search, save, and historical chat receipts.

The RMC gateway supports contextual recall, not list-all/edit/delete.
This router never reads or writes Supabase memory tables.
"""
from __future__ import annotations

from uuid import UUID, NAMESPACE_URL, uuid5

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import AuthUser, require_user
from ..config import get_settings
from ..db import SupabaseRepository
from ..memory_backend import memory_backend
from .adapter import LumenRmcMemory
from . import client as rmc

router = APIRouter(prefix="/v0.2/rmc")


class MemorySaveRequest(BaseModel):
    companion_id: UUID
    request_id: UUID
    content: str = Field(min_length=1, max_length=10000)


def _rmc_settings():
    settings = get_settings()
    if memory_backend(settings) != "rmc":
        raise HTTPException(status_code=409, detail="RMC is not the active memory backend.")
    return settings


async def _owned_companion(settings, user: AuthUser, companion_id: UUID):
    # Uses the authenticated user's token for RLS; enforce ownership again.
    row = await SupabaseRepository(settings, user.token).get_companion(str(companion_id))
    if not row or row.get("owner_user_id") != user.id:
        raise HTTPException(status_code=404, detail="Companion not found.")
    return row


def _panel_session(user_id: str, companion_id: str) -> str:
    # Distinct stable RMC session; not a conversation or chat session.
    return str(uuid5(NAMESPACE_URL, "lumen-rmc-memories-panel:" + user_id + ":" + companion_id))


@router.get("/memories")
async def search_rmc_memories(
    companion_id: UUID,
    q: str = Query(min_length=1, max_length=2000),
    user: AuthUser = Depends(require_user),
):
    settings = _rmc_settings()
    companion = await _owned_companion(settings, user, companion_id)
    query = q.strip()
    if not query:
        raise HTTPException(status_code=422, detail="Enter a memory topic.")
    status, rows = await LumenRmcMemory(settings, user.id).relevant(
        companion, _panel_session(user.id, str(companion_id)), query
    )
    if status in (rmc.DENIED, rmc.PRIVACY_DENIED):
        raise HTTPException(status_code=403, detail="Memory recall is not permitted.")
    if status != rmc.OK:
        raise HTTPException(status_code=503, detail="RMC memory search is unavailable.")
    return {
        "backend": "rmc",
        "scope": "relevant_evidence",
        "complete_inventory": False,
        "memories": [
            {"id": item["id"], "content": item["content"], "kind": item["type"]}
            for item in rows[:12]
        ],
    }


@router.post("/memories")
async def save_rmc_memory(payload: MemorySaveRequest, user: AuthUser = Depends(require_user)):
    settings = _rmc_settings()
    companion = await _owned_companion(settings, user, payload.companion_id)
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Memory text cannot be empty.")
    outcome = await LumenRmcMemory(settings, user.id).remember(
        companion, _panel_session(user.id, str(payload.companion_id)),
        str(payload.request_id), content
    )
    return {"backend": "rmc", "status": outcome, "confirmed": outcome in ("saved", "existing")}


@router.get("/receipts")
async def rmc_chat_receipts(
    companion_id: UUID,
    user: AuthUser = Depends(require_user),
):
    settings = _rmc_settings()
    await _owned_companion(settings, user, companion_id)
    # Chat messages, not Supabase memory tables. Only RMC-tagged assistant
    # acknowledgements are shown; earlier Supabase-era receipts are excluded.
    rows = await SupabaseRepository(settings, user.token)._request(
        "GET", "messages",
        params={
            "select": "id,content,created_at,metadata",
            "companion_id": "eq." + str(companion_id),
            "role": "eq.assistant",
            "order": "created_at.desc",
            "limit": "100",
        },
    )
    receipts = []
    statuses = {"saved", "existing", "memory_off", "not_saved", "unconfirmed"}
    for row in rows:
        metadata = row.get("metadata")
        if not isinstance(metadata, dict) or metadata.get("memory_backend") != "rmc":
            continue
        status = metadata.get("memory_status")
        if status not in statuses:
            continue
        receipts.append({
            "id": row.get("id"),
            "at": row.get("created_at"),
            "status": status,
            "message": str(row.get("content") or "")[:400],
        })
        if len(receipts) >= 20:
            break
    return {"backend": "rmc", "scope": "chat_acknowledgements", "receipts": receipts,
            "notice": "Past chat acknowledgements; not a complete inventory or current retention proof."}
