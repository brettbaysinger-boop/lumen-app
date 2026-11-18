"""High-confidence consent gate for shared conversational nicknames.

An LLM-generated nickname alone is never durable fact. When a person
*explicitly accepts* a companion proposal (or proposes one and the companion
responds affirmatively), the scoped, verbatim utterances may be sent through
the already-authenticated RMC gateway. The memory describes an in-chat
agreement, not a companion's subjective experience or a real-world romance.
"""
from __future__ import annotations

import re

# Positive consent must be unambiguous and brief. A negative or hypothetical
# statement cannot be laundered into an accepted shared memory.
_ACCEPT = re.compile(
    r"(?:\b(?:yes|yeah|yep|absolutely|definitely|perfect|agreed|sure|ok|okay)\b|"
    r"\b(?:you got it|sounds good|works for me|of course|i'?m in)\b|"
    r"\b(?:i|we) (?:love|like|adore) (?:it|that|those|the name|that name|"
    r"these names|those names|that nickname|the nickname|our nickname|them all)\b|"
    r"\b(?:let'?s|we should) (?:use|keep|go with|stick with) (?:it|that|"
    r"this|them|those|the name|these names|that name)\b|"
    r"\b(?:that|those|this) (?:sounds?|is|are) (?:great|perfect|awesome)\b)",
    re.IGNORECASE,
)
_VETO = re.compile(
    r"\b(?:no|not|never|maybe|perhaps|possibly|unsure|hypothetically|"
    r"pretend|imagine|instead|shouldn'?t|wouldn'?t|don'?t|do not|"
    r"stop|actually no|only if|unless)\b",
    re.IGNORECASE,
)
# Require an actual *naming proposal*, rather than ordinary chatter about
# a nickname. Narrow pattern is intentional: uncertain cases stay unsaved.
_NAME_PROPOSAL = re.compile(
    r"(?:\b(?:call (?:you|me|us|ourselves)|"
    r"you can call me|i(?:'ll| will) call you|"
    r"i(?:'m| am) going to call you|"
    r"let'?s call (?:you|me|us|ourselves)|"
    r"we(?:'ll| will| could| should) call ourselves|"
    r"we(?:'ll| will| could) be known as|"
    r"we(?:'re| are) calling ourselves|"
    r"(?:our|your|my) (?:couple |duo |team |shared )?"
    r"(?:nickname|name) (?:is|will be|would be|could be|to be|should be)|"
    r"our (?:nicknames|team name|duo name)|"
    r"(?:you(?:'re| are)|i(?:'m| am)|we(?:'re| are)) "
    r"(?:called|nicknamed))\b)",
    re.IGNORECASE,
)
_SECRET = re.compile(
    r"(?:password|passphrase|api key|secret|private key|"
    r"social security|bank account|credit card|passport|"
    r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|"
    r"\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|\b\d{4,}\b)",
    re.IGNORECASE,
)
_SENTENCE = re.compile(r"[^.!?\n]+(?:[.!?]+|$)")


def _affirms(value: str) -> bool:
    value = (value or "").strip()
    return (0 < len(value) <= 220 and "?" not in value
            and not _VETO.search(value) and bool(_ACCEPT.search(value)))


def _proposal(value: str) -> str | None:
    if not isinstance(value, str) or len(value) > 2400 or _SECRET.search(value):
        return None
    sentences = []
    for item in _SENTENCE.findall(value):
        text = item.strip()
        if 5 <= len(text) <= 320 and _NAME_PROPOSAL.search(text):
            sentences.append(text)
        if len(sentences) == 4:
            break
    if not sentences:
        return None
    joined = " ".join(sentences)
    return joined if len(joined) <= 950 else None


def agreed_nicknames(
    user_statement: str,
    previous_assistant: str = "",
    current_assistant: str = "",
    companion_name: str = "Lumen",
) -> str | None:
    """A source-backed in-chat naming agreement, or None.

    Case A: companion proposed in preceding assistant turn; user accepted.
    Case B: user proposed a name; companion accepted in the same turn.
    """
    if (not isinstance(user_statement, str) or len(user_statement) > 1100
            or _SECRET.search(user_statement)):
        return None
    name = (companion_name or "Companion").strip()
    if not re.fullmatch(r"[\w .'-]{1,65}", name):
        name = "Companion"

    prior_proposal = _proposal(previous_assistant)
    if prior_proposal and _affirms(user_statement):
        return (
            f"An in-chat nickname agreement with {name}. "
            f"{name} proposed: {prior_proposal!r}. "
            f"The user agreed to use that name, saying: {user_statement.strip()!r}."
        )

    user_proposal = _proposal(user_statement)
    if user_proposal and _affirms(current_assistant):
        return (
            f"An in-chat nickname agreement with {name}. "
            f"The user proposed: {user_proposal!r}. "
            f"{name} responded positively: {current_assistant.strip()[:220]!r}."
        )
    return None
