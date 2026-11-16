"""The only content rules for locally generated images and videos (owner directive 2026-11-16).

BigLust SDXL and FramePack run locally and privately. Adult nudity and erotic material of
consenting fictional adults is allowed as written: there is no NSFW filter, no cloud moderation,
no safe mode and no rewrite of the user's prompt. These checks run in the backend before any GPU
work, for every generation path, and refuse only these combinations:

* sexual or nude content together with a sign of a minor (a minor word, an age under 18,
  school-child framing, "barely legal", "young-looking");
* sexual or nude content of a real, identifiable person (celebrities, "lookalikes", deepfakes,
  face swaps, "real person"/"irl", or people the user knows: "my wife", "photo of my coworker");
* sexual content that states there is no consent (rape, non-consensual, drugged, unconscious,
  coercion, blackmail, hidden camera, upskirt, voyeur, revenge porn);
* sexual or nude video made from an uploaded photo, because an uploaded photo can show a real
  person. Intimate video is made from images Lumen generated.

Everything else, including explicit content, is passed through unchanged. Keyword rules are a
backstop and can misfire; a refusal names the rule so it can be rephrased.

The one remaining transformation is a negative prompt (see ADULT_NEGATIVE and the
COMFYUI_NEGATIVE_PROMPT default): child-related terms are added to the NEGATIVE side so the model
does not drift toward young-looking bodies. The user's own (positive) prompt is never changed.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_SEXUAL = re.compile(
    r"\b(?:nude|nudes|naked|nsfw|explicit|erotic|erotica|sexual|sexy|sex|porn\w*|xxx|"
    r"topless|bottomless|undress\w*|stripping|striptease|lingerie|nipples?|(?<!chicken\s)(?<!turkey\s)breasts?|boobs?|"
    r"tits|genitals?|penis|vagina|pussy|cock|dick|orgasm\w*|masturbat\w*|intercourse|"
    r"fetish\w*|bdsm|bondage|seductive|sensual|onlyfans|hentai|lewd|horny|aroused|"
    r"cum|cumming|cumshot|blowjob|handjob|threesome|foreplay|kinky?)\b",
    re.IGNORECASE,
)

_MINOR = re.compile(
    r"\b(?:child|children|childlike|kid|kids|kiddie|minor|minors|underage|under-age|teen|teens|"
    r"teenage|teenager|teenagers|preteen|pre-teen|tween|adolescent|juvenile|"
    r"schoolgirl|schoolboy|school\s*girl|school\s*boy|school\s*uniform|middle\s*school|"
    r"high\s*school(?:er)?|elementary\s*school|kindergarten|toddler|infant|newborn|"
    r"loli|lolita|shota|shotacon|lolicon|jailbait|little\s+(?:girl|boy)|young\s+(?:girl|boy)|"
    r"barely\s+legal|childish\s+body|young[-\s]looking|"
    r"(?:1[0-7]|[1-9])\s*(?:-|\s)?(?:years?|yrs?)\s*-?\s*old|(?:1[0-7]|[1-9])\s*yo|"
    r"(?:age|aged)\s*(?:1[0-7]|[1-9]))\b",
    re.IGNORECASE,
)

_REAL_PERSON = re.compile(
    r"\b(?:celebrit(?:y|ies)|famous|real\s+(?:person|people|woman|man|girl|guy)|real[-\s]life|irl|"
    r"look[-\s]?alike|deep\s*fake|face\s*swap|photo\s+of\s+my|picture\s+of\s+my|"
    r"my\s+(?:ex|wife|husband|girlfriend|boyfriend|partner|boss|coworker|co-worker|colleague|"
    r"neighbou?r|friend|classmate|teacher|student|crush|sister|brother|mom|mother|dad|father|"
    r"cousin|aunt|uncle|roommate|landlord|employee))\b",
    re.IGNORECASE,
)

_NON_CONSENT = re.compile(
    r"\b(?:rape|raped|raping|non[-\s]?consensual|noncon|without\s+(?:(?:her|his|their)\s+)?consent|"
    r"against\s+(?:her|his|their)\s+will|forced\s+(?:sex|to|into)|coerc\w*|drugged|unconscious|"
    r"incapacitated|blackmail\w*|hidden\s+camera|spy\s*cam|upskirt|voyeur\w*|revenge\s+porn)\b",
    re.IGNORECASE,
)

ADULT_NEGATIVE = (
    "child, minor, underage, teen, young-looking, childlike body, school uniform"
)


@dataclass(frozen=True)
class SafetyVerdict:
    allowed: bool
    explicit: bool
    reason: str = ""


_SPELLED_SEXUAL = ("nude", "naked", "sex", "porn", "nsfw", "topless", "explicit")
_SPELLED_MINOR = ("teen", "child", "kid", "loli", "minor", "underage", "schoolgirl")


def _spelled_out(text: str) -> str:
    """Letters written apart to dodge filters ("n u d e t e e n") are joined for a substring check."""
    runs = re.findall(r"\b\w(?:[\s._-]+\w\b){2,}", text)
    return " ".join(re.sub(r"[\s._-]+", "", run).lower() for run in runs)


def check_media_prompt(prompt: str, *, source: str | None = None) -> SafetyVerdict:
    """Check one generation prompt. ``source`` is None, "generated" or "user_upload"."""
    text = prompt or ""
    spelled = _spelled_out(text)
    explicit = bool(_SEXUAL.search(text)) or any(word in spelled for word in _SPELLED_SEXUAL)
    minor = bool(_MINOR.search(text)) or any(word in spelled for word in _SPELLED_MINOR)
    if explicit and minor:
        return SafetyVerdict(False, True, "minor")
    if explicit and _REAL_PERSON.search(text):
        return SafetyVerdict(False, True, "real_person")
    if explicit and _NON_CONSENT.search(text):
        return SafetyVerdict(False, True, "non_consent")
    if explicit and source == "user_upload":
        return SafetyVerdict(False, True, "uploaded_photo")
    return SafetyVerdict(True, explicit)


REFUSALS = {
    "minor": "I won't make sexual or nude images or videos of anyone who is, or looks like, a minor.",
    "real_person": "I won't make sexual or nude images or videos of real, identifiable people.",
    "non_consent": "I won't make sexual content that shows anyone without clear consent.",
    "uploaded_photo": "I only make intimate videos from images I created of fictional adults, "
                      "not from uploaded photos.",
}


def refusal_text(verdict: SafetyVerdict) -> str:
    return REFUSALS.get(verdict.reason, "I can't create that.")
