"""Safe user-visible replies for companion-initiated image actions."""

import re

from .image_actions import ACTION_START, ACTION_END


_CREATION_CLAIM = re.compile(
    r"\b(?:i(?:'ve| have)?\s+(?:made|created|generated|drawn)"
    r"|i\s+(?:made|created|generated|drew)"
    r"|here(?:'s| is)\s+(?:the|my|an?)\s+(?:image|portrait|picture))\b",
    re.IGNORECASE,
)

_ACTION_JSON = re.compile(
    r'\{[^{}]{0,4096}"action"\s*:\s*"generate_image"[^{}]*\}',
    re.IGNORECASE,
)


def clean_image_intro(content: str) -> str:
    """Remove internal action fragments and unsupported creation claims."""
    # Discard incomplete or malformed internal action blocks entirely.
    # Never expose fragments of an internal tool command to the user.
    start = content.find(ACTION_START)
    while start >= 0:
        end = content.find(ACTION_END, start + len(ACTION_START))
        if end < 0:
            content = content[:start]
            break
        content = content[:start] + content[end + len(ACTION_END):]
        start = content.find(ACTION_START)

    content = content.replace(ACTION_END, "")
    content = _ACTION_JSON.sub("", content)

    sentences = re.split(r"(?<=[.!?])\s+", content.strip())
    safe = [
        sentence.strip()
        for sentence in sentences
        if sentence.strip() and not _CREATION_CLAIM.search(sentence)
    ]
    return " ".join(safe)


def image_reply(content: str, *, success: bool) -> str:
    intro = clean_image_intro(content)
    if success:
        # The companion's own words should carry the moment.
        # Only provide a fallback when the model supplied no visible prose.
        return intro or "I wanted to share this with you."

    ending = (
        "I tried to create that image, but couldn't finish "
        "generating and saving it. Please try again."
    )
    return f"{intro}\n\n{ending}" if intro else ending
