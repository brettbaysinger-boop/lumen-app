import re


def requested_memory(message: str) -> str | None:
    """Only an explicit command at the beginning of a turn stores a fact."""
    match = re.fullmatch(
        r"(?:please\s+)?remember(?:\s+that\s+|\s*:\s*)(.+)",
        message.strip(), re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return None
    content = match.group(1).strip()
    return content or None
