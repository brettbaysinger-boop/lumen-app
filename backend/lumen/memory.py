import re


def requested_memory(message: str, companion_name: str = "Lumen") -> str | None:
    """Only an explicit command at the beginning of a turn stores a fact."""
    name = re.escape(companion_name.strip())
    address = rf"(?:{name}[,\s]+)?" if name else ""
    match = re.fullmatch(
        rf"(?:please\s+)?{address}(?:please\s+)?remember"
        r"(?:\s+that\s+|\s*[:,]\s*|\s+)(.+)",
        message.strip(), re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return None
    content = match.group(1).strip()
    if content.casefold() == "that" or content.casefold().startswith(
        ("when ", "how ", "what ", "where ", "to ")
    ):
        return None
    return content or None
