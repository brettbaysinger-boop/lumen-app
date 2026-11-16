"""Controlled automatic RMC ingestion from ordinary Lumen chat statements.

RMC/Hindsight remains the memory extractor and durable store. Lumen's existing
observation classifier acts ONLY as the host approval gate. Never send chat
history, assistant utterances, attachments or model-generated paraphrases to
RMC. Only a verbatim, non-sensitive, durable assertion from the current user's
message may be retained. No Supabase *memory* tables are accessed.

This worker is best-effort, background-only; chat always wins the model lock.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re

from .db import SupabaseRepository
from .memory_backend import uses_rmc
from .memory_durability import classify_natural_evidence
from .memory_quality import subject_content_issue, transient_memory_candidate
from .observations import Candidate, Candidates, automatic_candidate
from .ollama import OllamaProvider, model_lock, observation_tasks
from .rmc.adapter import LumenRmcMemory
from .rmc_shared_nicknames import agreed_nicknames

log = logging.getLogger(__name__)

# Final checks guard against PII/sensitive strings even if a classifier
# incorrectly marks a candidate not sensitive. Deliberately conservative.
_SENSITIVE = re.compile(
    r"(?:\b(?:health|diagnos\w*|medicat\w*|therap\w*|pregnan\w*|"
    r"religio\w*|politic\w*|sexual\w*|bank\w*|income|salary|debt|"
    r"password|passphrase|token|private key|api key|social security|"
    r"passport|driver.s license|street address|credit card|lawsuit)\b|"
    r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b\d{3}[-.)\s]+\d{3}[-.\s]+\d{4}\b|"
    r"\b\d{4,}\b)",
    re.IGNORECASE,
)
# A tiny deterministic high-precision path for explicit, low-risk user
# preferences. It prevents an empty LLM extraction response from discarding
# plain facts such as "My favorite fruit is golden kiwi." It is NOT a general
# text classifier: all other turns use the existing model screening.
_FAVORITE = re.compile(
    r"^My favorite (?P<kind>color|fruit|food|season|flower|animal|"
    r"movie|book|hobby|sport|music) is (?P<value>[^.!?\n]{2,70})\.$",
    re.IGNORECASE,
)


def deterministic_safe_preference(statement: str) -> Candidate | None:
    """Return only an unambiguous, entire-sentence, owner-spoken preference."""
    if not isinstance(statement, str) or _SENSITIVE.search(statement):
        return None
    match = _FAVORITE.fullmatch(statement.strip())
    if not match:
        return None
    kind, value = match.group("kind").casefold(), match.group("value").strip()
    if (not value or len(value.split()) > 9
            or any(token in value.casefold().split() for token in
                   ("maybe", "perhaps", "hypothetically", "if", "unless", "pretend",
                    "because", "but", "although", "actually", "or"))):
        return None
    candidate = Candidate(
        content="The user's favorite " + kind + " is " + value + ".",
        evidence=statement.strip(),
        subject="user", type="preference",
        direct_assertion=True, sensitive=False, conflicting=False,
        topic="favorite_" + kind, durable=True,
    )
    return candidate if approved_evidence(statement, candidate, "Companion") else None


_PROMPT = """You screen the CURRENT USER STATEMENT for durable personal memories.
Return JSON matching the schema. Propose up to 3 candidates, or none.
Evidence MUST be an exact substring of the current user statement.
Never extract anything from prior conversation, assistant text, speculation,
instructions, one-time requests, examples, roleplay, sensitive information,
private numbers, questions, errors, or short-lived moods.
Only explicit real-world facts about the speaker can be automatic candidates.
Use content such as 'The user owns a dog named Max' and set subject=user.
Set direct_assertion=true ONLY when the speaker explicitly asserts the fact.
Set sensitive=true for health, finance, intimate life, religion, politics,
exact address, legal issues, identifiers, secrets or unclear sensitive facts.
Set conflicting=true when a fact is ambiguous or needs interpretation.
Set durable=true only for stable personal details, lasting relationships,
preferences and longer-running goals. Include stable lowercase snake_case topic.
Return only the requested JSON schema; empty candidates if unsure.
"""


def approved_evidence(statement: str, candidate: Candidate, companion_name: str) -> str | None:
    """Approve source TEXT, not a model-written assertion; otherwise skip."""
    evidence = candidate.evidence.strip()
    if (not 12 <= len(evidence) <= 1000 or evidence not in statement
            or evidence.startswith(("http://", "https://"))
            or _SENSITIVE.search(evidence) or _SENSITIVE.search(candidate.content)):
        return None
    if not automatic_candidate(candidate, evidence):
        return None
    if classify_natural_evidence(statement, evidence, durable=candidate.durable).action != "allow":
        return None
    if transient_memory_candidate(
        candidate.content, evidence, candidate.subject, candidate.type,
        durable=candidate.durable
    ):
        return None
    if subject_content_issue(candidate.content, candidate.subject, candidate.type, companion_name):
        return None
    return evidence


async def _screen(settings, statement: str, companion: dict) -> list[Candidate]:
    # Plain, high-confidence preferences must not depend on model guessing.
    direct = deterministic_safe_preference(statement)
    if direct is not None:
        return [direct]
    model = (settings.memory_observation_model
             or companion.get("conversation_model")
             or settings.conversation_model)
    payload = {
        "companion_name": companion.get("name", "Companion"),
        "current_user_statement": statement,
    }
    # Deliberately no previous chat or old Supabase memories in model input.
    async with model_lock:
        result = await asyncio.wait_for(
            OllamaProvider(settings).structured(
                model, [
                    {"role": "system", "content": _PROMPT},
                    {"role": "user", "content": json.dumps(payload)},
                ], Candidates.model_json_schema(),
                max_tokens=900, timeout=50, think=False,
            ),
            timeout=55,
        )
    return Candidates.model_validate_json(result).candidates


async def auto_ingest_rmc_user_message(settings, token: str, user_id: str,
                                       message_id: str, assistant_text: str = "") -> None:
    """An RMC-mode background task; each source assertion has stable replay ID."""
    if not (uses_rmc(settings) and getattr(settings, "rmc_auto_ingest_enabled", False)):
        return
    db = SupabaseRepository(settings, token)
    try:
        rows = await db._request(
            "GET", "messages", params={"id": "eq." + message_id, "limit": "1"})
        if not rows or len(rows) != 1:
            return
        row = rows[0]
        if row.get("role") != "user" or not isinstance(row.get("metadata"), dict):
            return
        meta = dict(row["metadata"])
        if meta.get("rmc_auto_state") != "pending":
            return
        companion = await db.get_companion(row.get("companion_id"))
        if (not companion or companion.get("owner_user_id") != user_id
                or companion.get("auto_memory_enabled") is False):
            return
        statement = row.get("content", "")
        if (not isinstance(statement, str) or len(statement) > 2000
                or len(statement.strip()) < 2
                or meta.get("attachments") or meta.get("document_id")):
            return

        # Nicknames are different from one-speaker facts: the assistant can
        # suggest them, but only the user's explicit acceptance makes them
        # a shared conversation agreement. Read exactly the preceding
        # assistant turn, scoped by this conversation, via user-token RLS.
        preceding = ""
        if isinstance(row.get("created_at"), str):
            try:
                previous = await db._request(
                    "GET", "messages",
                    params={
                        "select": "content,role",
                        "conversation_id": "eq." + row["conversation_id"],
                        "role": "eq.assistant",
                        "created_at": "lt." + row["created_at"],
                        "order": "created_at.desc,id.desc",
                        "limit": "1",
                    },
                )
                if (len(previous) == 1 and previous[0].get("role") == "assistant"
                        and isinstance(previous[0].get("content"), str)):
                    preceding = previous[0]["content"]
            except Exception:
                # A missing previous turn never authorizes a nickname.
                preceding = ""

        shared_agreement = agreed_nicknames(
            statement, preceding, assistant_text, companion.get("name", "Companion")
        )
        if shared_agreement and _SENSITIVE.search(shared_agreement):
            shared_agreement = None
        # Short replies are eligible ONLY when they completed a verified
        # naming agreement; don't screen ordinary "yes" as standalone facts.
        if len(statement.strip()) < 12 and not shared_agreement:
            return

        if shared_agreement:
            # The user explicitly accepted a proposed nickname. This
            # source-backed agreement does not need an LLM classifier.
            candidates = []
        else:
            screening = asyncio.create_task(_screen(settings, statement, companion))
            observation_tasks.add(screening)
            try:
                candidates = await screening
            except asyncio.CancelledError:
                state, saved_count = "deferred", 0
                candidates = None
            except Exception:
                state, saved_count = "screen_unavailable", 0
                candidates = None
            finally:
                observation_tasks.discard(screening)

        # The owner can switch off automatic learning while screening is
        # running. Recheck their current RLS-protected companion preference
        # before issuing ANY durable RMC write.
        if candidates is not None:
            latest = await db.get_companion(row["companion_id"])
            if (not latest or latest.get("owner_user_id") != user_id
                    or latest.get("auto_memory_enabled") is False
                    or not (uses_rmc(settings) and
                            getattr(settings, "rmc_auto_ingest_enabled", False))):
                state, saved_count = "memory_off", 0
                candidates = None

        if candidates is not None:
            evidence = [shared_agreement] if shared_agreement else []
            for candidate in candidates:
                value = approved_evidence(statement, candidate, companion.get("name", "Companion"))
                if value and value not in evidence:
                    evidence.append(value)
                if len(evidence) >= 2:
                    break
            if not evidence:
                state, saved_count = "no_durable_fact", 0
            else:
                state, saved_count = "saved", 0
                memory = LumenRmcMemory(settings, user_id)
                for i, quote in enumerate(evidence):
                    try:
                        # Stable source key across any retry of the same message.
                        outcome = await memory.remember(
                            companion, row["conversation_id"],
                            ("auto-shared:" if shared_agreement else "auto:")
                            + message_id + ":" + str(i), quote
                        )
                    except Exception:
                        outcome = "unconfirmed"
                    if outcome in ("saved", "existing"):
                        saved_count += 1
                    elif outcome == "unconfirmed":
                        state = "unconfirmed"
                        break
                    elif outcome == "memory_off":
                        state = "memory_off"
                        break
                    else:
                        state = "not_saved"
                        break

        # Chat message metadata is a STATUS RECEIPT, not a second memory store.
        # Retain existing attachments and do not log user text.
        meta["rmc_auto_state"] = state
        meta["rmc_auto_confirmed_count"] = saved_count
        if shared_agreement and saved_count:
            meta["rmc_auto_kind"] = "agreed_nickname"
        await db._request(
            "PATCH", "messages",
            params={"id": "eq." + message_id, "companion_id": "eq." + row["companion_id"]},
            json={"metadata": meta},
        )
    except Exception:
        # Never claim a successful save on exceptions or print memory contents.
        log.warning("RMC automatic ingestion could not finish; check the user's receipt")
