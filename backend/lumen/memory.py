import re


def memory_request(message: str, companion_name: str = "Lumen") -> tuple[bool, str | None]:
    """Recognize explicit save requests; unresolved references require clarification."""
    name = re.escape(companion_name.strip())
    address = rf"(?:{name}[,\s]+)?" if name else ""
    prefix = rf"(?:please\s+)?{address}(?:please\s+)?(?:you\s+(?:(?:should|must|can|could)\s+|need\s+to\s+)(?:really\s+)?(?:please\s+)?)?"
    text = message.strip()
    # A sentence-ending “that” refers backward; the next sentence is not the fact.
    if re.match(prefix + r"remember\s+(?:that|this|it)(?=[.!?]|$)", text, re.IGNORECASE):
        return True, None
    match = re.fullmatch(
        prefix + r"remember\b(?:\s+that\b)?(?:\s*[:,]\s*|\s+)?(.*)",
        text, re.IGNORECASE | re.DOTALL,
    )
    if not match:
        match = re.fullmatch(
            prefix + r"(?:save|store|put|keep)\s+(?:(?:this|that|it)\s+)?"
            r"(?:in|to|into|as)\s+(?:(?:my|your|long-term|a)\s+)?memor(?:y|ies)"
            r"(?:\s*[:,]\s*|\s+)?(.*)",
            text, re.IGNORECASE | re.DOTALL,
        )
    if not match:
        return False, None
    content = match.group(1).strip()
    # Recalling an event and scheduling a reminder are not memory writes.
    if content.casefold().startswith(("when ", "how ", "what ", "where ", "to ")):
        return False, None
    if content.strip(" .!?,:").casefold() in ("", "this", "that", "it", "this in your memory", "that in your memory"):
        return True, None
    return True, content


def requested_memory(message: str, companion_name: str = "Lumen") -> str | None:
    return memory_request(message, companion_name)[1]


# These claims are incompatible with an ordinary generation: no write was performed.
_SAVE_CLAIM = re.compile(
    r"\b(?:i(?:['’]ve| have)?|i['’]ll|i will)\s+"
    r"(?:(?:have|already|just|successfully|definitely|surely)\s+)*"
    r"(?:saved|stored|noted|memorized|recorded|save|store|added)\b"
    r"|\bi(?:['’]ve| have)\s+(?:taken|made|created)\s+(?:that |the |a |your )?note\b"
    r"|\bi(?:['’]ll| will)\s+(?:always\s+|definitely\s+|make sure to\s+)?remember\b"
    r"|\bi(?:['’]ll| will)\s+(?:always\s+|definitely\s+)?(?:keep|retain|hold)\b[^.!?\n]{0,200}\b(?:memory|memories)\b"
    r"|\bi(?:['’]ve| have)?\s+(?:(?:have|already|just|successfully)\s+)*"
    r"(?:updated|changed|corrected|replaced|deleted|removed|forgotten)\b"
    r"[^.!?\n]{0,120}\b(?:memory|memories|preference|preferences|saved fact|saved facts)\b"
    r"|\b(?:added|committed)\s+.{0,80}\b(?:memory|memories)\b",
    re.IGNORECASE,
)


def has_save_claim(content: str) -> bool:
    return bool(_SAVE_CLAIM.search(content))


def is_memory_recall(message: str, companion_name: str = "Lumen") -> bool:
    name = re.escape(companion_name.strip())
    address = rf"(?:{name}[,\s]+)?" if name else ""
    return bool(re.fullmatch(
        address + r"(?:what do you remember(?: about me)?|what (?:are|do you have in) your memories|"
        r"(?:show|list)(?: me)? (?:your|my|our|saved) memories)[?.!]*",
        message.strip(), re.IGNORECASE,
    ))


def memory_subject(content: str, companion_name: str, user_name: str = '') -> str:
    """Conservative attribution from explicit wording, never an invented speaker."""
    text = content.strip().casefold()
    if re.match(r"(?:our\b|we\b)", text):
        return 'shared'
    if re.match(r"(?:my\b|i\b|i['’]m\b)", text):
        return 'user'
    if re.match(r"(?:your\b|you\b)", text) or text.startswith(companion_name.casefold() + "'s"):
        return 'companion'
    if user_name and (text.startswith(user_name.casefold() + "'s") or
                      text.startswith(user_name.casefold() + ' ')):
        return 'user'
    return 'unknown'
