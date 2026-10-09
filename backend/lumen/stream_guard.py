"""Preserve ordinary chat streaming without exposing standalone JSON actions."""


class LegacyImageJSONGuard:
    """Hold a possible leading JSON object until it is safe to show."""

    def __init__(self):
        self.pending = ""
        self.decided = False

    def push(self, text: str) -> str:
        if self.decided:
            return text

        self.pending += text
        candidate = self.pending.lstrip()

        if not candidate:
            return ""

        # Standalone legacy image actions begin with a JSON object.
        # Keep that object private until the runtime validates it.
        if candidate.startswith("{"):
            return ""

        self.decided = True
        visible = self.pending
        self.pending = ""
        return visible

    def finish(self) -> str:
        if self.decided:
            return ""
        # A leading JSON object may be an internal image command.
        # The runtime will send the validated final reply after generation.
        return ""
