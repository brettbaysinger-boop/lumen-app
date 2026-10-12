"""Deterministic guardrails for long-term memory attribution and durability."""
from __future__ import annotations

import re

_USER_PREFIX = re.compile(
    r"^(?:the user(?:'s|’s)?\b|i\b|i['’]m\b|my\b)",
    re.IGNORECASE,
)
_COMPANION_GENERIC_PREFIX = re.compile(
    r"^(?:the companion(?:'s|’s)?\b)",
    re.IGNORECASE,
)
_SHARED_PREFIX = re.compile(r"^(?:we\b|our\b)", re.IGNORECASE)
_EXPLICIT_USER_EVIDENCE = re.compile(
    r"\b(?:i|i['’]m|i['’]ve|i['’]d|i['’]ll|me|my|mine)\b",
    re.IGNORECASE,
)
_TRANSIENT_UNKNOWN = re.compile(
    r"^(?:still\b|again\b|close\b|nope\b|nah\b|wrong\b|"
    r"try again\b|not quite\b|better\b|worse\b|wtf\b|"
    r"that(?:'s| is)\b|this(?:'s| is)\b|it(?:'s| is)\b)",
    re.IGNORECASE,
)


def _normalized(text: str) -> str:
    return " ".join((text or "").strip().split())


def _companion_prefix(text: str, companion_name: str) -> bool:
    name = re.escape(_normalized(companion_name))
    if not name:
        return False
    return bool(re.match(
        rf"^(?:{name}(?:'s|’s)?\b|{name}\s+(?:wants|prefers|likes|loves|is|has|needs|plans|hopes)\b)",
        text,
        re.IGNORECASE,
    ))


def _explicit_shared(text: str, companion_name: str) -> bool:
    if _SHARED_PREFIX.match(text):
        return True
    name = re.escape(_normalized(companion_name))
    if not name:
        return False
    return bool(re.match(
        rf"^(?:the user and {name}\b|{name} and the user\b)",
        text,
        re.IGNORECASE,
    ))


def subject_content_issue(
    content: str,
    subject: str,
    memory_type: str,
    companion_name: str,
) -> str | None:
    """Return only high-confidence ownership contradictions."""
    text = _normalized(content)
    if not text:
        return "Memory wording is empty."
    if subject not in {"user", "companion", "shared", "unknown"}:
        return "Memory subject is invalid."

    if _explicit_shared(text, companion_name):
        if subject == "shared":
            return None
        if subject == "unknown":
            return "Memory wording has clear shared ownership but the selected subject is unknown."
        return "Memory wording describes a shared fact but the selected subject is not shared."

    if subject == "companion" and _USER_PREFIX.match(text):
        return "Memory wording describes the user but the selected subject is the companion."

    if subject == "user" and (
        _COMPANION_GENERIC_PREFIX.match(text)
        or _companion_prefix(text, companion_name)
    ):
        return "Memory wording describes the companion but the selected subject is the user."

    if subject == "unknown":
        if _USER_PREFIX.match(text):
            return "Memory wording has clear user ownership but the selected subject is unknown."
        if _COMPANION_GENERIC_PREFIX.match(text) or _companion_prefix(text, companion_name):
            return "Memory wording has clear companion ownership but the selected subject is unknown."

    return None


def evidence_has_explicit_user_owner(evidence: str) -> bool:
    return bool(_EXPLICIT_USER_EVIDENCE.search(evidence or ""))


def transient_memory_candidate(
    content: str,
    evidence: str,
    subject: str,
    memory_type: str,
    *,
    durable: bool,
) -> bool:
    """Reject obvious immediate-result feedback from long-term memory."""
    if not durable:
        return True
    if subject != "unknown" or memory_type != "episodic":
        return False
    text = _normalized(evidence or content)
    return len(text.split()) <= 16 and bool(_TRANSIENT_UNKNOWN.match(text))
