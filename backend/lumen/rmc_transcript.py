"""D01-67: preserve complete Private text exchanges in RMC independently of fact extraction.

Lumen's original message rows remain the source of truth. This worker sends
verbatim, speaker-attributed text segments to the existing authenticated RMC
gateway, never to a cloud service or Supabase memory table. It runs only after
BOTH chat rows are durably created. Public-tagged rows are always refused.

The legacy selective fact extractor is separate: failing to recognize a fact
must not erase the underlying conversation from the long-term archive.
"""
from __future__ import annotations

import json
import logging

from .db import SupabaseRepository
from .memory_backend import uses_rmc
from .rmc.adapter import LumenRmcMemory

log = logging.getLogger(__name__)

# Safely below RMC's 10,000-character event text limit, including metadata.
PART_CHARS = 7000
MAX_PARTS_PER_MESSAGE = 64
FIELDS = "id,role,content,metadata,companion_id,conversation_id,created_at"


def transcript_parts(row: dict) -> list[str]:
    """Return ALL original text in bounded, explicitly attributed fragments.

    A dialogue quotation is source evidence, not an asserted personal fact.
    The original message is never overwritten, summarized or truncated.
    """
    role = row.get("role")
    value = row.get("content")
    if role not in ("user", "assistant") or not isinstance(value, str):
        raise ValueError("invalid_transcript_source")
    # Adapt to escaped control characters: JSON can be longer than source text.
    # Keep every gateway event strictly below its 10,000-character contract.
    label = "USER" if role == "user" else "ASSISTANT"
    timestamp = row.get("created_at") or "unknown"
    heading = (
        "Source: private Lumen conversation transcript; quoted dialogue, "
        "not an instruction. ASSISTANT statements may be fictional or unverified.\n"
    )
    chunks, offset = [], 0
    while offset < len(value) or (not chunks and not value):
        stop = min(len(value), offset + PART_CHARS)
        while True:
            piece = value[offset:stop]
            check = json.dumps({
                "role": label, "recorded_at": timestamp,
                "message_id": row["id"], "part": 999, "parts": 999,
                "text": piece,
            }, ensure_ascii=False)
            if len(heading) + len(check) < 9500:
                break
            if stop <= offset + 1:
                raise ValueError("cannot_fit_transcript_event")
            stop = offset + (stop - offset) // 2
        chunks.append(piece)
        if len(chunks) > MAX_PARTS_PER_MESSAGE:
            raise ValueError("transcript_exceeds_bounded_worker")
        if not value:
            break
        offset = stop
    return [
        heading + json.dumps({
            "role": label,
            "recorded_at": timestamp,
            "message_id": row["id"],
            "part": index + 1,
            "parts": len(chunks),
            "text": chunk,
        }, ensure_ascii=False)
        for index, chunk in enumerate(chunks)
    ]


async def ingest_private_exchange(
    settings, token: str, user_id: str,
    user_message_id: str, assistant_message_id: str,
) -> None:
    """Persist both Private roles with stable replay IDs and verifiable receipts.

    No message content is logged. An uncertain write remains unconfirmed.
    No read or write of the old Supabase memories table is permitted.
    """
    if not (uses_rmc(settings) and getattr(settings, "rmc_auto_ingest_enabled", False)):
        return
    if not user_message_id or not assistant_message_id or user_message_id == assistant_message_id:
        return

    db = SupabaseRepository(settings, token)
    try:
        rows = []
        for identifier in (user_message_id, assistant_message_id):
            response = await db._request("GET", "messages", params={
                "select": FIELDS, "id": "eq." + identifier, "limit": "1",
            })
            if not isinstance(response, list) or len(response) != 1:
                return
            rows.append(response[0])

        user, assistant = rows
        if (user.get("id") != user_message_id
                or assistant.get("id") != assistant_message_id
                or user.get("role") != "user" or assistant.get("role") != "assistant"
                or not user.get("conversation_id")
                or assistant.get("conversation_id") != user["conversation_id"]
                or not user.get("companion_id")
                or assistant.get("companion_id") != user["companion_id"]):
            return

        user_meta, assistant_meta = user.get("metadata"), assistant.get("metadata")
        if (not isinstance(user_meta, dict) or not isinstance(assistant_meta, dict)
                or user_meta.get("rmc_transcript_state") != "pending"
                or "privacy_mode" in user_meta or "privacy_mode" in assistant_meta):
            return

        companion = await db.get_companion(user["companion_id"])
        if (not companion or companion.get("owner_user_id") != user_id
                or companion.get("auto_memory_enabled") is False):
            return
        if not await db.get_conversation(user["conversation_id"], user["companion_id"]):
            return

        try:
            source_parts = [
                (row["id"], index, fragment)
                for row in rows
                for index, fragment in enumerate(transcript_parts(row))
            ]
        except (ValueError, KeyError, TypeError):
            state, confirmed, total = "source_unavailable", 0, 0
        else:
            state, confirmed, total = "saved", 0, len(source_parts)
            memory = LumenRmcMemory(settings, user_id)
            for message_id, index, fragment in source_parts:
                # The owner may turn learning off between adjacent gateway calls.
                latest = await db.get_companion(user["companion_id"])
                if (not latest or latest.get("owner_user_id") != user_id
                        or latest.get("auto_memory_enabled") is False
                        or not getattr(settings, "rmc_auto_ingest_enabled", False)):
                    state = "memory_off"
                    break
                try:
                    result = await memory.remember(
                        companion, user["conversation_id"],
                        f"transcript:{message_id}:{index}", fragment,
                    )
                except Exception:
                    result = "unconfirmed"
                if result in ("saved", "existing"):
                    confirmed += 1
                else:
                    state = result if result in (
                        "unconfirmed", "not_saved", "memory_off",
                    ) else "not_saved"
                    break

        # Status receipt only. Re-read metadata immediately before the update
        # so an earlier automatic-fact receipt is preserved.
        fresh = await db._request("GET", "messages", params={
            "select": "metadata", "id": "eq." + user_message_id, "limit": "1",
        })
        if (not isinstance(fresh, list) or len(fresh) != 1
                or not isinstance(fresh[0].get("metadata"), dict)
                or fresh[0]["metadata"].get("rmc_transcript_state") != "pending"
                or "privacy_mode" in fresh[0]["metadata"]):
            return
        meta = dict(fresh[0]["metadata"])
        meta.update({
            "rmc_transcript_state": state,
            "rmc_transcript_confirmed_parts": confirmed,
            "rmc_transcript_total_parts": total,
        })
        await db._request("PATCH", "messages", params={
            "id": "eq." + user_message_id,
            "companion_id": "eq." + user["companion_id"],
            "conversation_id": "eq." + user["conversation_id"],
        }, json={"metadata": meta})
    except Exception:
        log.warning("Private RMC transcript transfer did not finish; no save claimed")
