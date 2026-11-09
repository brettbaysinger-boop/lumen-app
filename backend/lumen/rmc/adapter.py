"""Lumen-specific adapter onto the RMC application gateway.

Lumen stays the host: it verifies the signed-in user with Supabase Auth
(`auth.require_user`) and companion ownership through row-level security
plus an explicit `owner_user_id` check here, before anything is sent to RMC.
RMC itself is never modified; this module only speaks the gateway contract
in `client.py`.

There is no fallback to Supabase in this module. A failed or uncertain RMC
operation is reported as such and never as a save.
"""
from __future__ import annotations

from datetime import datetime, timezone
import logging
from uuid import NAMESPACE_URL, uuid5

from . import client as rmc

log = logging.getLogger(__name__)

# Lumen memory_status values for an explicit "remember that" in RMC mode.
SAVED = "saved"
EXISTING = "existing"
MEMORY_OFF = "memory_off"
NOT_SAVED = "not_saved"
UNCONFIRMED = "unconfirmed"

_WRITE_STATUS = {
    rmc.STORED: SAVED,
    rmc.ALREADY_STORED: EXISTING,
    rmc.PRIVACY_DENIED: MEMORY_OFF,
    rmc.DENIED: NOT_SAVED,
    rmc.UNAVAILABLE: NOT_SAVED,
    rmc.UNCERTAIN: UNCONFIRMED,
}

# Lumen has no private-chat mode yet, so every Lumen conversation is a
# "normal" RMC session. Private sessions, learning and recall switches are
# enforced by RMC host policy at the gateway.
SESSION_MODE = "normal"
MAX_MEMORIES = 12
MAX_QUESTION = rmc.MAX_QUESTION


def source_id_for(installation_id: str, user_id: str, companion_id: str,
                  request_key: str) -> str:
    """Stable per Lumen request, so a retried request is a ledger replay."""
    digest = uuid5(NAMESPACE_URL, "lumen-rmc-source:" + "\0".join(
        (installation_id, user_id, companion_id, str(request_key)))).hex
    return "lumen-" + digest


def memories_from_context(context: dict, limit: int = MAX_MEMORIES) -> list[dict]:
    """Map an RMC evidence bundle to Lumen's prompt memory rows."""
    rows, seen, referenced = [], set(), set()
    for claim in context.get("candidate_claims") or []:
        if not isinstance(claim, dict) or not isinstance(claim.get("text"), str):
            continue
        text = claim["text"].strip()
        if not text or text in seen:
            continue
        seen.add(text)
        referenced.update(d for d in claim.get("source_document_ids") or []
                          if isinstance(d, str))
        rows.append({"id": str(claim.get("memory_id") or ""), "content": text[:1000],
                     "subject": "unknown", "type": "rmc"})
    for document in context.get("source_documents") or []:
        if not isinstance(document, dict) or document.get("document_id") in referenced:
            continue
        text = document.get("original_text")
        if isinstance(text, str) and text.strip() and text.strip() not in seen:
            seen.add(text.strip())
            rows.append({"id": str(document.get("document_id") or ""),
                         "content": text.strip()[:1000],
                         "subject": "unknown", "type": "rmc_source"})
    return rows[:limit]


class LumenRmcMemory:
    def __init__(self, settings, user_id: str | None, *, client=None, clock=None):
        self.settings = settings
        self.user_id = user_id
        self._client = client
        self._config_error: str | None = None
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    def _gateway(self):
        if self._client is None and self._config_error is None:
            try:
                self._client = rmc.RmcGatewayClient(rmc.load_config(self.settings))
            except rmc.RmcConfigError as exc:
                self._config_error = exc.code
                log.error("RMC memory backend is selected but unusable: %s", exc.code)
        return self._client

    @property
    def installation_id(self) -> str:
        client = self._gateway()
        return client.config.installation_id if client else ""

    def _owned(self, companion: dict | None) -> bool:
        """The Supabase row was read with the user's token (RLS); check again."""
        return (isinstance(companion, dict)
                and rmc.valid_id(self.user_id)
                and rmc.valid_id(companion.get("id"))
                and companion.get("owner_user_id") == self.user_id)

    async def relevant(self, companion: dict, conversation_id: str,
                       question: str) -> tuple[str, list[dict]]:
        if not self._owned(companion) or not rmc.valid_id(conversation_id):
            return rmc.DENIED, []
        client = self._gateway()
        if client is None:
            return rmc.UNAVAILABLE, []
        question = (question or "").strip()[:MAX_QUESTION]
        if not question:
            return rmc.OK, []
        result = await client.recall(
            user_id=self.user_id, companion_id=companion["id"],
            session_id=conversation_id, session_mode=SESSION_MODE,
            question=question)
        if result.outcome != rmc.OK:
            return result.outcome, []
        return rmc.OK, memories_from_context(result.context or {})

    async def remember(self, companion: dict, conversation_id: str,
                       request_key: str, content: str) -> str:
        if not self._owned(companion) or not rmc.valid_id(conversation_id):
            return NOT_SAVED
        if not content or not content.strip() or len(content) > rmc.MAX_MEMORY_TEXT:
            return NOT_SAVED  # the gateway would refuse it; nothing is sent
        client = self._gateway()
        if client is None:
            return NOT_SAVED
        stamp = self._clock().astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        result = await client.remember(
            user_id=self.user_id, companion_id=companion["id"],
            session_id=conversation_id, session_mode=SESSION_MODE,
            source_id=source_id_for(client.config.installation_id, self.user_id,
                                    companion["id"], request_key),
            timestamp=stamp, text=content)
        return _WRITE_STATUS.get(result.outcome, UNCONFIRMED)
