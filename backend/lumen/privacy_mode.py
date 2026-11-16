"""Public / Private mode: what Lumen may use while other people may be nearby.

The owner turns Public mode on by hand, per device (Issue #39). It never means "on the
internet": Lumen stays a single-user, Tailscale-only app. It means "someone may overhear".

Enforcement happens at the data layer, before any context is built for the model:

* ``PublicModeRepository`` wraps the existing ``SupabaseRepository``. In Public mode it
  reads only the tables a conversation needs (companion, its state, this conversation and
  messages written in Public mode). Every other read or write (memories, profile, documents,
  My Day reads, goals, search RPCs, observations, storage uploads, ...) raises
  ``PublicModeDenied`` before the request leaves the backend. Unknown tables are denied.
* ``PublicModeMemory`` stands in for the RMC adapter, so neither RMC nor Supabase memory
  is read or written, and no memory observation is queued for the turn.
* ``PublicCognitionRuntime`` is the existing ``CognitionRuntime`` with those two parts
  swapped in, plus a short discretion note in the system prompt. Requests that can only be
  answered from private data get a short, discreet reply without calling the model.

Private mode is the existing ``CognitionRuntime``, unchanged. No runtime.py edit is needed.
"""
from __future__ import annotations

from typing import Literal

from .db import SupabaseRepository
from .documents import document_command
from .goal_actions import save_session_request
from .media_jobs import video_request
from .memory import is_memory_recall, memory_request
from .my_day import parse_action
from .runtime import CognitionRuntime
from .schemas import Attachment, RespondResponse

PrivacyMode = Literal["private", "public"]
PRIVACY_MODES = ("private", "public")
MESSAGE_TAG = "privacy_mode"   # messages.metadata key written on every Public-mode message
# Background memory learning that must never start from a Public turn (D01-63E, PR #38, and the
# older Supabase observations). Forced off for the Public runtime's own settings view.
PUBLIC_DISABLED_SETTINGS = {"rmc_auto_ingest_enabled": False, "memory_observations_enabled": False}
# Message metadata keys that would queue background learning. Never written from Public.
LEARNING_METADATA_PREFIXES = ("rmc_auto_",)

# Tables a Public-mode turn may touch, by HTTP method. Everything else is denied.
PUBLIC_ACCESS: dict[str, frozenset[str]] = {
    "GET": frozenset({"companions", "companion_state", "conversations", "messages"}),
    # my_day_items: write-only capture ("add a task: ...") repeats only the user's own words.
    "POST": frozenset({"conversations", "messages", "gallery_items", "my_day_items"}),
    "PATCH": frozenset({"conversations"}),
}
# Conversation fields that carry earlier private context into a turn.
PRIVATE_CONVERSATION_FIELDS = ("handoff", "goal_item_id")
# The owner writes the companion's description, persona, self-model prompt and appearance freely,
# and they can hold personal details. In Public only a reviewed subset is used: her name and
# pronouns from the saved companion, and a built-in personality sketch. A per-companion,
# owner-reviewed Public persona would need a new column (schema change, owner decision).
PUBLIC_COMPANION_FIELDS = ("id", "name", "gender", "pronouns", "conversation_model")
PUBLIC_PERSONA = ("Warm, witty and curious. Speaks naturally and kindly, with light humor, "
                  "and keeps replies easy to listen to.")
PUBLIC_PROFILE = {"id": "withheld while Public mode is on", "display_name": "the user"}

DISCREET_REPLIES = {
    "memory_save": "I'll hold off on saving that while we're in Public mode. Tell me again when "
                   "you switch to 🔒 Private and I'll keep it.",
    "memory_recall": "That's one for just the two of us. Switch to 🔒 Private when it's only you "
                     "and I'll go through it.",
    "documents": "I'll keep your documents closed for now. Switch to 🔒 Private and I'll open them "
                 "with you.",
    "my_day": "Let's look at your plans when it's just us. Switch to 🔒 Private and I'll read them out.",
    "practice": "I'll save practice sessions once we're back in 🔒 Private.",
    "private_data": "I'd rather keep that between us for now. Ask me again in 🔒 Private.",
    "media": "I'll make pictures and videos once we're back in 🔒 Private.",
}

PUBLIC_GUIDANCE = """

Public mode (people may be nearby):
The user switched this on by hand. You cannot see or hear who is present, so never claim to.
Stay fully yourself: the same warmth, humor, curiosity and voice. Ordinary conversation,
general knowledge, the weather, ideas and light planning stay natural.
Personal memories, documents, reminders, profile details and earlier private conversations
are not available to you in this mode. Do not bring up, guess at or hint about the user's
private life, relationships, health, money, location, plans or anything they told you privately.
If the user asks for something personal, answer in one short, kind line without hinting at the
content, and offer to pick it up when they switch to Private.
Do not announce Public mode on every turn; mention it only when it explains a choice.
Do not create images or videos in this mode.
"""


class PublicModeDenied(Exception):
    """A Public-mode turn asked for data it may not use. Never shown to the user verbatim."""


def public_access_allowed(method: str, table: str) -> bool:
    return table in PUBLIC_ACCESS.get(method.upper(), frozenset())


def is_public_message(row: dict) -> bool:
    return isinstance(row, dict) and (row.get("metadata") or {}).get(MESSAGE_TAG) == "public"


class PublicModeRepository(SupabaseRepository):
    """The existing repository, limited to what a Public-mode turn may read and write."""

    def __init__(self, inner: SupabaseRepository):
        # Same address and same user token: row-level security is unchanged.
        self.base_url = inner.base_url
        self.headers = inner.headers
        self.denied: list[str] = []
        self.created_conversation_id: str | None = None

    async def _request(self, method: str, table: str, **kwargs):
        if not public_access_allowed(method, table):
            self.denied.append(f"{method.upper()} {table}")
            raise PublicModeDenied(table)
        if method.upper() == "POST" and table == "messages":
            payload = dict(kwargs.get("json") or {})
            metadata = {k: v for k, v in (payload.get("metadata") or {}).items()
                        if not k.startswith(LEARNING_METADATA_PREFIXES)}
            payload["metadata"] = {**metadata, MESSAGE_TAG: "public"}
            kwargs["json"] = payload
        rows = await super()._request(method, table, **kwargs)
        if method.upper() == "GET" and table == "messages" and isinstance(rows, list):
            # Earlier messages from Private mode never reach a Public-mode turn.
            rows = [row for row in rows if is_public_message(row)]
        if table == "conversations" and isinstance(rows, list):
            rows = [{k: v for k, v in row.items() if k not in PRIVATE_CONVERSATION_FIELDS}
                    if isinstance(row, dict) else row for row in rows]
            if method.upper() == "POST" and rows and isinstance(rows[0], dict):
                self.created_conversation_id = rows[0].get("id")
        return rows

    async def get_profile(self, user_id: str):
        return dict(PUBLIC_PROFILE)

    async def remember(self, *args, **kwargs):
        self.denied.append("remember")
        raise PublicModeDenied("memories")

    async def upload_storage(self, bucket: str, *args, **kwargs):
        self.denied.append(f"storage {bucket}")
        raise PublicModeDenied("storage")


class PublicSettings:
    """The app's settings as a Public turn sees them: background learning is always off."""

    def __init__(self, inner):
        object.__setattr__(self, "_inner", inner)

    def __getattr__(self, name):
        if name in PUBLIC_DISABLED_SETTINGS:
            return PUBLIC_DISABLED_SETTINGS[name]
        return getattr(self._inner, name)

    def __setattr__(self, name, value):
        raise AttributeError("Public-mode settings are read-only")


class PublicModeMemory:
    """Stands in for the RMC adapter: nothing is recalled, nothing is saved."""

    async def relevant(self, companion, conversation_id, message):
        return "ok", []

    async def remember(self, *args, **kwargs):
        return "memory_off"


def public_companion(companion: dict) -> dict:
    """The companion as a Public-mode prompt may describe her: no owner-written free text."""
    safe = {k: companion.get(k) for k in PUBLIC_COMPANION_FIELDS if k in companion}
    return {**safe, "description": "", "persona": PUBLIC_PERSONA, "system_prompt": "",
            "visual_identity": "not described in Public mode"}


def private_request_kind(message: str, companion_name: str, document_id: str | None = None) -> str | None:
    """Requests that can only be answered from private data. The data layer is the backstop."""
    if document_id or document_command(message) is not None:
        return "documents"
    if memory_request(message, companion_name)[0]:
        return "memory_save"
    if is_memory_recall(message, companion_name):
        return "memory_recall"
    if save_session_request(message, companion_name):
        return "practice"
    if video_request(message):
        return "media"
    try:
        command = parse_action(message, "UTC", companion_name=companion_name)
    except Exception:
        command = None
    if command and command.get("read"):
        return "my_day"
    return None


class PublicCognitionRuntime(CognitionRuntime):
    """The existing runtime with Public-mode data access. Personality and prompts are reused."""

    privacy_mode: PrivacyMode = "public"

    def __init__(self, settings, access_token: str | None = None, user_id: str | None = None):
        super().__init__(PublicSettings(settings), access_token, user_id)
        self.db = PublicModeRepository(self.db)
        self.rmc_memory = PublicModeMemory()
        self.rmc_auto_message_id = None

    def __setattr__(self, name, value):
        # Layer 1 of 3 against automatic RMC learning (runtime): a Public turn never hands the
        # request queue a message to learn from, whatever the inherited runtime computes.
        if name == "rmc_auto_message_id":
            value = None
        super().__setattr__(name, value)

    @staticmethod
    def _build_system_prompt(companion: dict, state: dict | None, memories: list[dict],
                             profile: dict | None = None) -> str:
        state = {k: v for k, v in (state or {}).items() if k not in ("current_goal", "current_context")}
        prompt = CognitionRuntime._build_system_prompt(public_companion(companion), state, [], dict(PUBLIC_PROFILE))
        prompt = prompt.replace("- No long-term memories available yet.",
                                "- Withheld while Public mode is on.")
        return prompt + PUBLIC_GUIDANCE

    async def respond(self, companion_id: str, conversation_id: str | None, user_message: str,
                      attachments: list[Attachment] | None = None, emit=None,
                      document_id: str | None = None) -> RespondResponse:
        companion = await self.db.get_companion(companion_id)
        if not companion:
            raise ValueError(f"Companion {companion_id} not found")
        kind = private_request_kind(user_message, companion["name"], document_id)
        if kind is None:
            try:
                return await super().respond(companion_id, conversation_id, user_message,
                                             attachments, emit=emit, document_id=document_id)
            except PublicModeDenied:
                kind = "private_data"
        return await self._discreet_turn(companion_id, conversation_id or self.db.created_conversation_id,
                                         user_message, attachments or [], kind, emit)

    async def _discreet_turn(self, companion_id, conversation_id, user_message, attachments, kind, emit):
        content = DISCREET_REPLIES[kind]
        if conversation_id:
            if not await self.db.get_conversation(conversation_id, companion_id):
                raise ValueError("Conversation not found for this companion")
        else:
            conversation_id = (await self.db.create_conversation(companion_id, "New Conversation"))["id"]
        await self.db.create_message({
            "conversation_id": conversation_id, "companion_id": companion_id, "role": "user",
            "content": user_message,
            "metadata": {"attachments": [a.model_dump() for a in attachments]} if attachments else {},
        })
        assistant = await self.db.create_message({
            "conversation_id": conversation_id, "companion_id": companion_id, "role": "assistant",
            "content": content, "model_used": "public-mode-discretion",
            "tokens_in": None, "tokens_out": None, "latency_ms": 0,
            "metadata": {"runtime": "v0.1", "public_mode_redirect": kind},
        })
        await self.db.touch_conversation(conversation_id, 2)
        if emit:
            await emit({"type": "reset", "text": ""})
            await emit({"type": "delta", "text": content})
        return RespondResponse(conversation_id=conversation_id, message_id=assistant["id"], content=content,
                               model="public-mode-discretion", provider="lumen", latency_ms=0,
                               memory_count=0, memory_status="none")


def runtime_for(mode: PrivacyMode) -> type[CognitionRuntime]:
    """Private is the existing runtime, unchanged. Anything else must already be rejected by schema."""
    if mode == "private":
        return CognitionRuntime
    if mode == "public":
        return PublicCognitionRuntime
    raise ValueError("Unknown privacy mode")


PUBLIC_SPEECH_DENIED = "Lumen won't read that aloud while Public mode is on."


async def public_speech_allowed(db: SupabaseRepository, message_id: str | None, text: str) -> bool:
    """In Public mode, speak only text from an assistant reply that was itself written in Public mode."""
    if not message_id:
        return False
    rows = await db._request("GET", "messages", params={
        "id": f"eq.{message_id}", "select": "id,role,content,metadata", "limit": "1"})
    if not rows:
        return False
    row = rows[0]
    spoken = text.strip()
    return (row.get("role") == "assistant" and is_public_message(row) and bool(spoken)
            and spoken in (row.get("content") or ""))
