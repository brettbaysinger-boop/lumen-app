"""Strict parsing of companion-initiated image actions."""

import json
from dataclasses import dataclass

ACTION_START = "<lumen_image_action>"
ACTION_END = "</lumen_image_action>"


@dataclass(frozen=True)
class ImageAction:
    prompt: str
    subject: str | None = None


def parse_image_action(payload: str) -> ImageAction | None:
    """Accept only the supported image action with a bounded prompt."""
    try:
        value = json.loads(payload)
    except (TypeError, ValueError):
        return None

    if not isinstance(value, dict):
        return None

    if not {"action", "action_input"} <= set(value):
        return None
    if not set(value) <= {"action", "action_input", "subject"}:
        return None
    if value.get("subject") not in (None, "self", "other"):
        return None

    if value["action"] != "generate_image":
        return None

    prompt = value["action_input"]
    if not isinstance(prompt, str):
        return None

    prompt = prompt.strip()
    if not 1 <= len(prompt) <= 1000:
        return None

    return ImageAction(
        prompt=prompt,
        subject=value.get("subject"),
    )


def extract_image_action(content: str) -> tuple[str, ImageAction | None]:
    """Remove one complete, valid action block from a generated reply."""
    start = content.find(ACTION_START)
    if start < 0:
        return content, None

    payload_start = start + len(ACTION_START)
    end = content.find(ACTION_END, payload_start)
    if end < 0:
        return content, None

    if content.find(ACTION_START, payload_start) >= 0 and content.find(ACTION_START, payload_start) < end:
        return content, None

    action = parse_image_action(content[payload_start:end].strip())
    if action is None:
        return content, None

    cleaned = (content[:start] + content[end + len(ACTION_END):]).strip()
    return cleaned, action


def extract_standalone_image_action(content: str) -> tuple[str, ImageAction | None]:
    """Recognize a standalone legacy JSON action, never JSON inside prose.

    The complete trimmed model response must be exactly one valid action
    object. This intentionally does not execute quoted examples, Markdown
    code fences, or embedded JSON snippets.
    """
    candidate = content.strip()

    if not candidate.startswith("{") or not candidate.endswith("}"):
        return content, None

    action = parse_image_action(candidate)

    if action is None:
        return content, None

    return "", action


class ImageActionStreamFilter:
    """Stream ordinary text while withholding bounded image-action blocks."""

    MAX_ACTION_BYTES = 4096

    def __init__(self):
        self.pending = ""
        self.action_payload = ""
        self.in_action = False
        self.action = None
        self.invalid_action = False

    def push(self, text: str) -> str:
        self.pending += text
        visible = []

        while self.pending:
            if self.in_action:
                end = self.pending.find(ACTION_END)

                if end >= 0:
                    self.action_payload += self.pending[:end]
                    self.pending = self.pending[end + len(ACTION_END):]

                    candidate = parse_image_action(self.action_payload.strip())

                    if candidate is not None and self.action is None:
                        self.action = candidate
                    else:
                        self.invalid_action = True

                    self.action_payload = ""
                    self.in_action = False
                    continue

                keep = 0
                for length in range(
                    min(len(ACTION_END) - 1, len(self.pending)), 0, -1
                ):
                    if self.pending.endswith(ACTION_END[:length]):
                        keep = length
                        break

                if keep:
                    self.action_payload += self.pending[:-keep]
                    self.pending = self.pending[-keep:]
                else:
                    self.action_payload += self.pending
                    self.pending = ""

                if len(self.action_payload) > self.MAX_ACTION_BYTES:
                    self.invalid_action = True
                    self.action_payload = ""
                    self.in_action = False
                    self.pending = ""

                break

            start = self.pending.find(ACTION_START)

            if start >= 0:
                visible.append(self.pending[:start])
                self.pending = self.pending[start + len(ACTION_START):]
                self.in_action = True
                continue

            keep = 0
            for length in range(
                min(len(ACTION_START) - 1, len(self.pending)), 0, -1
            ):
                if self.pending.endswith(ACTION_START[:length]):
                    keep = length
                    break

            if keep:
                visible.append(self.pending[:-keep])
                self.pending = self.pending[-keep:]
            else:
                visible.append(self.pending)
                self.pending = ""

            break

        return "".join(visible)

    def finish(self) -> str:
        remaining = "" if self.in_action else self.pending

        if self.in_action:
            self.invalid_action = True

        self.pending = ""
        self.action_payload = ""
        self.in_action = False
        return remaining
