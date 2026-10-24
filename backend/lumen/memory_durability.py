"""Conservative, evidence-first durability decisions for natural memory proposals.

Only current user text is admissible evidence. No personally named end user
or specific companion is used to decide storage. Conservative rules:
- skip unmistakable one-off dialogue
- review ambiguous lasting instructions or embedded factual questions
- allow ordinary assertions (subject and sensitivity checked elsewhere)
Explicit, intentional "remember this" uses a separate user-controlled path.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class DurabilityDecision:
    action: Literal["allow", "review", "skip"]
    reason: str = ""


_GREETING = re.compile(
    r"^(?:hi|hello|hey|good morning|good afternoon|good evening|good night)\b",
    re.IGNORECASE,
)
_HEAR_ME = re.compile(
    r"\b(?:can|could|do) you (?:hear|see) me\b", re.IGNORECASE,
)
_ONE_OFF_IMPERATIVE = re.compile(
    r"^(?:(?:dammit|please|hey|okay)[,!.\s]+)*"
    r"(?:tell|show|give|send|play|read|write|draw|generate|translate|summarize|"
    r"explain|try again|repeat|say)\s+",
    re.IGNORECASE,
)
_ONE_OFF_QUESTION = re.compile(
    r"^(?:(?:please|hey)[,!.\s]+)*"
    r"(?:can|could|would|will) you\s+"
    r"(?:tell|show|give|send|play|read|write|draw|generate|translate|"
    r"summarize|explain)\b",
    re.IGNORECASE,
)
_ADDRESS_REQUEST = re.compile(
    r"(?:\b(?:will|can|could|would) you\s+(?:please\s+)?call me\b|"
    r"^(?:please\s+)?call me\b|"
    r"\bcall me\b.*\bfrom now on\b|^from now on[, ]+call me\b)",
    re.IGNORECASE,
)
_EPHEMERAL_MOOD = re.compile(
    r"^(?:i(?:['’]?m| am)|im)\s+"
    r"(?:hungry|tired|bored|sleepy|horny|horney|frustrated|exhausted)\b",
    re.IGNORECASE,
)
_FACTUAL_SELF_ASSERTION = re.compile(
    r"\b(?:i|im|my|mine|our|we(?:['’]?re| are))\b",
    re.IGNORECASE,
)
_EXPLICIT_REMEMBER = re.compile(
    r"^(?:please\s+)?remember\b", re.IGNORECASE,
)
_WH_INTERROGATIVE = re.compile(
    r"^(?:what|when|where|who|why|how|which|did|do|does|are|is|can|could|"
    r"will|would|should|have|has)\b",
    re.IGNORECASE,
)
_TRANSIENT_FEEDBACK = re.compile(
    r"^(?:still\b|try again\b|not quite\b|nope\b|nah\b|"
    r"wtf\b|that's wrong\b|that is wrong\b)",
    re.IGNORECASE,
)
# Only a standalone clarification about information requested is skippable.
# Mixed turns with personal assertions remain reviewable.
_SOURCE_CLARIFICATION = re.compile(
    r"^(?:no[,!\s]+)?i\s+(?:(?:was|am)\s+(?:wanting|trying)\s+to\s+(?:know|ask|find\s+out)|"
    r"was\s+asking)\s+(?:what|which|where|when|why|how|who)\b[^.!?\n]*[.!?]?$",
    re.IGNORECASE,
)
_SOURCE_ADDITIONAL_ASSERTION = re.compile(
    r"\b(?:and|but|because|although|my|our|we)\b", re.IGNORECASE
)


def _clean(value: str) -> str:
    return " ".join((value or "").strip().split())


def classify_natural_evidence(
    user_statement: str,
    evidence: str,
    *,
    durable: bool = True,
) -> DurabilityDecision:
    """Classify *natural extraction*, never explicit user-directed saves.

    The current message may have multiple clauses. Preserve a possible
    factual assertion for review rather than discarding it based on a
    question mark or a polite opening.
    """
    if not durable:
        return DurabilityDecision("skip", "model_not_durable")

    source = _clean(user_statement)
    quote = _clean(evidence)
    if not source or not quote:
        return DurabilityDecision("skip", "empty_evidence")

    # An explicit save request belongs to the deterministic explicit-memory
    # route. It is not automatically censored by these natural-chat rules.
    if _EXPLICIT_REMEMBER.match(source):
        return DurabilityDecision("review", "explicit_remember_statement")

    # A source containing a durable assertion plus a separate request is
    # uncertain, so let the user review the candidate.
    assertive = bool(_FACTUAL_SELF_ASSERTION.search(source))
    if _HEAR_ME.search(source):
        return DurabilityDecision("review" if assertive else "skip", "connection_check")

    if _ADDRESS_REQUEST.search(source):
        return DurabilityDecision("review", "form_of_address_request")

    if _EPHEMERAL_MOOD.match(source):
        return DurabilityDecision("review" if "from now on" in source.casefold()
                                  else "skip", "temporary_state")

    if _GREETING.match(source) and not assertive:
        return DurabilityDecision("skip", "greeting")

    if _TRANSIENT_FEEDBACK.match(source) and not assertive:
        return DurabilityDecision("skip", "immediate_feedback")

    if _SOURCE_CLARIFICATION.fullmatch(source):
        # The first-person "I was wanting to know" is a request, not a
        # long-term preference. Avoid blanket suppression of mixed statements.
        if _SOURCE_ADDITIONAL_ASSERTION.search(source):
            return DurabilityDecision("review", "clarification_with_possible_assertion")
        return DurabilityDecision("skip", "one_time_clarification")

    # An isolated imperative is not a fact. The quote must not launder it
    # into a purported durable preference.
    if _ONE_OFF_IMPERATIVE.match(source) or _ONE_OFF_QUESTION.match(source):
        return DurabilityDecision("review" if assertive else "skip", "one_time_request")

    if "?" in source:
        if assertive:
            return DurabilityDecision("review", "question_with_factual_assertion")
        return DurabilityDecision("skip", "unanswered_question")

    if _WH_INTERROGATIVE.match(source):
        return DurabilityDecision("review" if assertive else "skip", "question_or_request")

    return DurabilityDecision("allow")
