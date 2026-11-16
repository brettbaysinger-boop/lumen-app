"""Durable, low-risk conversation continuity candidates for native RMC.

Only first-party USER declarations are admitted, exactly as stated. This does
not infer that the companion shares a feeling or has a romantic relationship.
The caller must still enforce RMC active, owner/companion permission, sensitive
data exclusion and the native RMC privacy gate.

This covers a few important facts that a model classifier otherwise misses:
preferred form of address, an explicitly stated ongoing goal/project,
and a directly asserted recurring conversational tradition.
"""
from __future__ import annotations

import re

_ALLOWED = (
    # Explicit preferences about how the assistant addresses/speaks to user.
    re.compile(
        r"^(?:Please )?(?:call me|address me as|you can call me|"
        r"I (?:go by|prefer to be called))\s+.{2,75}[.!]?$",
        re.I,
    ),
    re.compile(
        r"^(?:I prefer (?:when you|that you)|"
        r"I like (?:it )?when you|"
        r"My preferred (?:style|tone) (?:for our chats )?is)\s+.{4,160}[.!]?$",
        re.I,
    ),
    # Current interests, projects, lasting goals; do not capture one-off tasks.
    re.compile(
        r"^(?:My (?:long[- ]term|ongoing|current) (?:goal|project|plan) is|"
        r"I(?:'m| am) (?:currently |still )?(?:building|developing|working on)|"
        r"I plan to keep working on)\s+.{4,240}[.!]?$",
        re.I,
    ),
    # Statements about a recurring routine/tradition, not a one-off proposal.
    re.compile(
        r"^(?:Our (?:ongoing|recurring|weekly|monthly) (?:ritual|tradition|routine) is|"
        r"Whenever we (?:chat|talk), we (?:usually|always)|"
        r"Our (?:inside joke|running joke) (?:is|about)|"
        r"You and I (?:always|usually) (?:talk|chat|play|work)|"
        r"You and I (?:often|always) (?:laugh|joke) about)\s+.{3,180}[.!]?$",
        re.I,
    ),
)
# Ambiguity, secrets, hypothetical instructions and one-time requests must
# not become durable statements. Extra checks are applied by the caller.
_REFUSE = re.compile(
    r"\b(?:if|unless|hypothetically|pretend|imagine|maybe|perhaps|"
    r"might|could|would|should|used to|once|for today|just now|"
    r"password|passphrase|secret|token|api key|social security|"
    r"bank account|credit card|private key)\b",
    re.I,
)


def durable_continuity_evidence(statement: str) -> str | None:
    """Return the *verbatim* user's statement, or refuse safely."""
    if not isinstance(statement, str):
        return None
    raw = statement.strip()
    if (not 18 <= len(raw) <= 320 or "\n" in raw or "\r" in raw
            or "?" in raw or _REFUSE.search(raw)):
        return None
    if not any(rule.fullmatch(raw) for rule in _ALLOWED):
        return None
    return raw
