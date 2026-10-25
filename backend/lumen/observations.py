"""Evidence-backed natural memories, with conservative automatic-save classification."""
import asyncio
import json
import logging
import re
from .ollama import model_lock, observation_tasks
from .memory_quality import (
    evidence_has_explicit_user_owner,
    subject_content_issue,
    transient_memory_candidate,
)
from .memory_durability import classify_natural_evidence
from .memory_retrieval import rank_memories, terms
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from .db import SupabaseRepository
from .ollama import OllamaProvider

logger = logging.getLogger(__name__)

class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(min_length=1, max_length=500)
    evidence: str = Field(min_length=1, max_length=1000)
    subject: Literal["user", "companion", "shared", "unknown"]
    type: Literal["semantic", "preference", "relationship", "episodic"]
    direct_assertion: bool = False
    sensitive: bool = True
    conflicting: bool = True
    topic: str = Field(default="", max_length=80)
    durable: bool = True

class Candidates(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidates: list[Candidate] = Field(max_length=3)


def relevant_existing_for_extraction(memories: list[dict], statement: str, *, limit: int = 6) -> list[dict]:
    """Bound memory context to active, lexically related facts, never the full profile.

    The SQL review RPC remains authoritative for exact duplicate and topic
    conflict checks. Even this small context is reference data, not evidence
    of a fact asserted in the current user message.
    """
    query = terms(statement)
    if not query:
        return []
    ranked = rank_memories(memories, statement, limit=limit)
    selected = []
    for memory in ranked:
        tags = memory.get("tags") or []
        text = str(memory.get("content") or "") + " " + " ".join(
            value for value in tags if isinstance(value, str)
        ) if isinstance(tags, list) else str(memory.get("content") or "")
        if query & terms(text):
            selected.append(memory)
    return selected


EXTRACTION_PROMPT = """Extract up to three useful long-term memory proposals from the current user's statement.
Conversation context may be supplied only to resolve references such as "you", "her",
"that", or an omitted subject. Never extract a memory from context alone. The current
user statement is the only evidence source.

Consider stable preferences, identity, relationships, important events, ongoing goals,
and meaningful long-running project state. Set durable=true only when the information
will plausibly matter in a later conversation. Set durable=false for immediate result
feedback, throwaway reactions, temporary UI/image-generation complaints, greetings,
questions, roleplay, hypothetical examples, or one-off wording like "still wrong" or
"try again". Return an empty candidates list when there is no durable memory.
A one-time greeting, request, reaction, image or microphone check is not a durable
memory even when the user asks warmly or emphatically. A question may contain a
durable claim (for example, "Did you know I'm the creator?"); propose only the
claim with its verbatim user-message evidence and require review rather than
assuming every question must become a preference.

Each evidence must copy an exact substring of the supplied user statement, with no
explanation, prefix, quote marks added by you, or changed punctuation.
For user_statement "I prefer rainy days", evidence is "I prefer rainy days";
it must NOT be "The user stated 'I prefer rainy days'."

Content must be a standalone fact whose wording agrees with its subject. Use "The user"
for speaker-owned facts and the companion's actual name for companion-owned facts.
subject=user describes the speaker; companion describes the AI; shared involves both;
unknown describes someone else or genuinely unclear ownership. If context shows that
an otherwise ambiguous description refers to the companion, name the companion in the
content instead of rewriting it as "The user". A user describing the companion is a
user report, not proof of AI feelings or consciousness.

Classify every proposal: direct_assertion=true only for an explicit real fact the speaker
states about themselves. sensitive=true for health, sexuality, religion, politics,
financial/legal details, credentials, precise location, or private identifying numbers.
conflicting=true for contradiction with existing memory, uncertain meaning, ownership,
interpretation, or when ownership depends on conversational context rather than explicit
wording in the current user statement. topic is a stable lowercase snake_case attribute
(e.g. favorite_color, preferred_season, current_project); use an empty topic if no clear
attribute exists. Never mark questions, hypotheticals, instructions or inferred facts
as direct. Return JSON matching the required structured-output schema."""


# Ollama drops the FRONT of an oversized prompt, which is where the grounding
# instructions are. Never send one: budget the whole request conservatively.
_OUTPUT_RESERVE_TOKENS = 1000  # structured() max_tokens
_TEMPLATE_RESERVE_TOKENS = 256  # chat template, role markers, special tokens


def estimate_tokens(text: str) -> int:
    """Conservative token estimate without the model's tokenizer.

    Non-ASCII text counts one token per UTF-8 byte, an upper bound for
    byte-level tokenizers. ASCII counts one token per three characters.
    """
    ascii_chars = sum(1 for ch in text if ord(ch) < 128)
    other_bytes = len(text.encode("utf-8")) - ascii_chars
    return -(-ascii_chars // 3) + other_bytes


def extraction_prompt_budget(settings) -> int:
    window = min(getattr(settings, "memory_observation_context_tokens", 4096),
                 getattr(settings, "chat_context_length", 8192))
    return window - _OUTPUT_RESERVE_TOKENS - _TEMPLATE_RESERVE_TOKENS


def fit_extraction_messages(prompt: str, payload: dict, schema: dict, budget: int):
    """Return chat messages within budget, or None if the statement cannot fit.

    Optional context goes first: lowest-ranked memories, then the oldest prior
    turns. The user statement is never shortened, because it is the only
    evidence source.
    """
    payload = {**payload,
               "existing_memories": list(payload["existing_memories"]),
               "conversation_context": list(payload["conversation_context"])}
    fixed = estimate_tokens(prompt) + estimate_tokens(json.dumps(schema, ensure_ascii=False))
    while True:
        content = json.dumps(payload, ensure_ascii=False)
        if fixed + estimate_tokens(content) <= budget:
            return [{"role": "system", "content": prompt}, {"role": "user", "content": content}]
        if payload["existing_memories"]:
            payload["existing_memories"].pop()
        elif payload["conversation_context"]:
            payload["conversation_context"].pop(0)
        else:
            return None


async def observe(settings, token: str, message_id: str):
    task = asyncio.create_task(_observe(settings, token, message_id))
    observation_tasks.add(task)
    try:
        await task
    except asyncio.CancelledError:
        # Foreground chat preempted extraction; its failed job remains retryable.
        if not task.cancelled():
            raise
    finally:
        observation_tasks.discard(task)

async def _observe(settings, token: str, message_id: str):
    if not token:
        # SupabaseRepository falls back to the service-role key without a user
        # token, which bypasses RLS. Extraction must only run as the owner.
        logger.warning("Memory observation skipped: no user token")
        return
    db = SupabaseRepository(settings, token)
    try:
        claimed = await db._request("POST", "rpc/claim_memory_observation", json={"p_message": message_id})
        if not claimed:
            return
        rows = await db._request("GET", "messages", params={"id": f"eq.{message_id}", "limit": "1"})
        if not rows or rows[0]["role"] != "user":
            raise ValueError("Source unavailable")
        source = rows[0]
        companion = await db.get_companion(source["companion_id"])
        # This is a conservative, model-independent check. Obvious single-turn
        # requests and greetings cannot become durable user memories merely
        # because a model invents candidate facts from other context.
        decision = classify_natural_evidence(source["content"], source["content"])
        if decision.action == "skip":
            await db._request("PATCH", "memory_observations",
                              params={"source_message_id": f"eq.{message_id}"},
                              json={"status": "done", "updated_at": "now()"})
            return
        existing = await db._request("GET", "memories", params={
            "companion_id": f"eq.{source['companion_id']}", "select": "content,subject,is_active,tags", "limit": "500"})
        # Retrieval is restricted to a small, relevant subset. Supplying the
        # entire memory inventory can overflow the inference context and
        # silently truncate the source-only evidence instructions.
        extraction_memories = relevant_existing_for_extraction(
            existing, source["content"])
        prompt = EXTRACTION_PROMPT
        prior = []
        if source.get("conversation_id") and source.get("created_at"):
            prior = await db._request("GET", "messages", params={
                "conversation_id": f"eq.{source['conversation_id']}",
                "created_at": f"lt.{source['created_at']}",
                "order": "created_at.desc,id.desc",
                "limit": "6",
            })
            prior = [
                {"role": row.get("role"), "content": (row.get("content") or "")[-1200:]}
                for row in reversed(prior)
                if row.get("role") in ("user", "assistant")
            ]
        payload = {
            "companion_name": companion["name"],
            "conversation_context": prior,
            "user_statement": source["content"],
            # A bounded selection helps with contradictions without drowning
            # the actual source statement in past memories.
            "existing_memories": extraction_memories,
            # The schema is already enforced by Ollama's "format" parameter.
            # Do not waste prompt budget serializing it a second time.
        }
        schema = Candidates.model_json_schema()
        budget = extraction_prompt_budget(settings)
        messages = fit_extraction_messages(prompt, payload, schema, budget)
        if messages is None:
            # Fail closed and stay retryable: no model call, no proposal, and
            # the original message is untouched. Counts only, never text.
            logger.warning("Memory observation source exceeds extraction budget "
                           "source_tokens_est=%d budget=%d",
                           estimate_tokens(source["content"]), budget)
            raise ValueError("Memory observation source exceeds extraction budget")
        stats = {}
        async with model_lock:
            # Follow the selected chat model by default to avoid a second large model load.
            raw = await asyncio.wait_for(OllamaProvider(settings).structured(
                settings.memory_observation_model or companion.get("conversation_model") or settings.conversation_model,
                messages, schema, think=False, stats=stats), timeout=60)
        evaluated = stats.get("prompt_eval_count")
        if isinstance(evaluated, int) and evaluated > budget + _TEMPLATE_RESERVE_TOKENS:
            # The estimate was wrong, so the instructions may have been cut.
            logger.warning("Memory observation prompt exceeded budget "
                           "prompt_eval_count=%d budget=%d", evaluated, budget)
            raise ValueError("Memory observation prompt exceeded budget")
        proposals = Candidates.model_validate_json(raw)
        # Validate the entire model batch BEFORE creating proposals. A later
        # invalid candidate must not leave earlier partial writes behind
        # while marking this observation failed and retryable.
        verified = []
        rejected_evidence = 0
        rejected_subject = 0
        for c in proposals.candidates:
            evidence = c.evidence
            if evidence not in source["content"]:
                # Only salvage a literal fact present in both the user message
                # and the model's quotation. Never paraphrase user evidence.
                fact = c.content.strip()
                if fact and fact in source["content"] and fact in evidence:
                    evidence = fact
                else:
                    rejected_evidence += 1
                    continue
            if not c.content.strip() or not evidence.strip():
                rejected_evidence += 1
                continue
            durability = classify_natural_evidence(
                source["content"], evidence, durable=c.durable
            )
            if durability.action == "skip":
                continue
            if durability.action == "review":
                c = c.model_copy(update={"conflicting": True})
            if transient_memory_candidate(
                c.content, evidence, c.subject, c.type, durable=c.durable
            ):
                continue
            if subject_content_issue(
                c.content, c.subject, c.type, companion["name"]
            ):
                rejected_subject += 1
                continue
            if c.subject == "user" and not evidence_has_explicit_user_owner(evidence):
                c = c.model_copy(update={"conflicting": True})
            verified.append((c, evidence))

        if rejected_evidence or rejected_subject:
            logger.warning(
                "Memory observation rejected candidates invalid_evidence=%d "
                "invalid_subject=%d",
                rejected_evidence, rejected_subject,
            )
            raise ValueError("Unverified memory evidence")

        for c, evidence in verified:
            proposal = await db._request("POST", "rpc/propose_memory", json={
                "p_message": message_id, "p_content": c.content, "p_evidence": evidence,
                "p_subject": c.subject, "p_type": c.type})
            if proposal and automatic_candidate(c, evidence, source["content"]) and len(existing) < 500:
                await db._request("POST", "rpc/auto_save_memory_suggestion", json={
                    "p_id": proposal, "p_topic": c.topic})
        await db._request("PATCH", "memory_observations", params={"source_message_id": f"eq.{message_id}"},
                          json={"status": "done", "updated_at": "now()"})
    except (Exception, asyncio.CancelledError) as exc:
        # Never expose statements or secrets in logs; a failed observation cannot erase a reply.
        logger.warning("Memory observation failed; review inbox can retry it")
        try:
            await db._request("PATCH", "memory_observations", params={"source_message_id": f"eq.{message_id}"},
                              json={"status": "failed", "updated_at": "now()"})
        except Exception:
            pass
        if isinstance(exc, asyncio.CancelledError):
            raise


# Unreviewed auto-save is an allowlist, not a blocklist. Only one class of
# fact qualifies: a single-sentence message that is itself a simple positive
# first-person preference ("I like X", "My favorite Y is X", "X is my favorite
# Y"), restated as the same preference about the same object. Every other
# verb, category or shape stays a reviewable proposal.
_PREFERENCE_VERBS = r"(?:like|love|enjoy|prefer|adore)"
_PREFERENCE_SHAPES = (
    re.compile(r"^i\s+(?:really\s+|absolutely\s+|just\s+)?" + _PREFERENCE_VERBS + r"\s+(?P<obj>.+)$", re.I),
    re.compile(r"^my\s+favou?rite\s+(?P<kind>[a-z]+(?:\s+[a-z]+)?)\s+(?:is|are)\s+(?P<obj>.+)$", re.I),
    re.compile(r"^(?P<obj>.+?)\s+(?:is|are)\s+my\s+favou?rite\s+(?P<kind>[a-z]+(?:\s+[a-z]+)?)$", re.I),
)
_CONTENT_SHAPES = (
    re.compile(r"^the user\s+(?:really\s+)?(?:likes|loves|enjoys|prefers|adores)\s+(?P<obj>.+)$", re.I),
    re.compile(r"^the user['’]s\s+favou?rite\s+(?P<kind>[a-z]+(?:\s+[a-z]+)?)\s+(?:is|are)\s+(?P<obj>.+)$", re.I),
)
_AUTO_SOURCE_MAX_CHARS = 200
_AUTO_OBJECT_MAX_WORDS = 8
# The whole message is checked, not just the quoted span: any of these
# anywhere means a person must review the proposal.
_REVIEW_SIGNALS = re.compile(
    # corrections, uncertainty, hypotheticals and play
    r"\b(actually|i mean|jk|just kidding|kidding|joking|scratch that|correction|wait|sarcas\w*|"
    r"if|maybe|perhaps|probably|possibly|hypothetic\w*|pretend\w*|roleplay|role-play|imagine|"
    r"story|character|fiction\w*|scenario|might|could|would|should|wish|guess|suppose|"
    r"think|thinks|thought|believe|kinda|sort of|"
    # negation and contrast
    r"not|no|never|none|nothing|neither|nor|anymore|used to|without|"
    r"but|although|though|however|except|unless|whereas|yet|instead|until|"
    r"hate\w*|dislike\w*|detest\w*|loath\w*|despise\w*|avoid\w*|allergic|"
    # reported or quoted speech
    r"said|says|saying|wrote|writes|told|tells|asked|texted|emailed|messaged|posted|"
    r"replied|quot\w*|according|claim\w*|heard|insist\w*|swear\w*|swore|"
    # health, sexuality, religion, politics, money, identity, legal
    r"health|diagnos\w*|medic\w*|prescri\w*|pill\w*|meds|drug\w*|dose\w*|dosage|mg|"
    r"therap\w*|doctor|clinic|hospital|disorder|disease|illness|symptom\w*|"
    r"cancer|diabet\w*|hiv|adhd|autis\w*|anxiety|depress\w*|bipolar|ptsd|suicid\w*|surgery|"
    r"pregnan\w*|disab\w*|sobriety|sober|rehab|addict\w*|weed|cannabis|marijuana|"
    r"sex\w*|gay|lesbian|bisexual|queer|transgender|trans|nonbinary|"
    r"religio\w*|god|jesus|allah|christian|muslim|jewish|hindu|buddhist|atheist|"
    r"church|mosque|synagogue|temple|pray\w*|"
    r"politic\w*|republican|democrat|liberal|conservative|vot\w*|trump|biden|"
    r"salary|income|earn\w*|paid|pay|wage\w*|debt|bank|loan|mortgage|credit|bankrupt\w*|"
    r"password|passcode|pin|secret|address|street|zip|postcode|phone|email|"
    r"ssn|social security|passport|license|licence|"
    r"lawsuit|arrest\w*|convict\w*|probation|immigra\w*|visa)\b"
    # anything with digits, money, contact handles, or quotes
    r"|\d|[$€£¥@#%]|[\"“”„«»]|n['’]t\b|\?|^\s*>",
    re.IGNORECASE | re.MULTILINE,
)
# Common pharmaceutical name endings, since medication names are open-ended.
_DRUG_NAME = re.compile(
    r"\b\w+(?:formin|pril|sartan|olol|statin|azole|cillin|mycin|cycline|floxacin|"
    r"azepam|zolam|oxetine|aline|triptan|tidine|prazole|semide|lukast|"
    r"glutide|gliptin|mab|nib|vir|done|codone|morphone|phetamine|phenidate)\b",
    re.IGNORECASE,
)
# A preference about another person is a relationship fact, not a taste.
_PERSON_OBJECT = re.compile(
    r"\b(?:his|her|their|your|our|him|them|you|us|"
    r"my\s+(?:\w+\s+)?(?:wife|husband|partner|spouse|boyfriend|girlfriend|ex|fianc\w*|"
    r"mom|mother|dad|father|parents?|son|daughter|kids?|children|child|baby|"
    r"brother|sister|siblings?|family|grand\w*|aunt|uncle|cousin|"
    r"friends?|boss|manager|coworkers?|colleagues?|neighbou?rs?|teacher|"
    r"doctor|therapist|pastor|priest))\b",
    re.IGNORECASE,
)


def _sentence(text: str) -> str:
    return " ".join(text.split()).rstrip(".! ")


def _preference_object(sentence: str, shapes) -> tuple[str, str] | None:
    for shape in shapes:
        match = shape.match(sentence)
        if match:
            return match.group("obj"), match.groupdict().get("kind") or ""
    return None


def automatic_candidate(candidate, evidence, source=None):
    """Fail closed: unreviewed saving is limited to one allowlisted fact class.

    Model flags are necessary, never sufficient. The ENTIRE source message
    must be one simple positive first-person preference that the evidence
    quotes in full, and the content must restate that same preference about
    the same object. Anything else is left as a reviewable proposal.
    """
    source = evidence if source is None else source
    if not (candidate.durable and candidate.subject == "user" and candidate.direct_assertion
            and not candidate.sensitive and not candidate.conflicting
            and re.fullmatch(r"[a-z][a-z0-9_]{1,79}", candidate.topic)):
        return False
    statement = _sentence(source)
    content = _sentence(candidate.content)
    if (len(source) > _AUTO_SOURCE_MAX_CHARS or "\n" in source.strip()
            or _sentence(evidence) != statement or re.search(r"[.!;:]", statement)):
        return False
    for text in (source, content, candidate.topic.replace("_", " ")):
        if _REVIEW_SIGNALS.search(text) or _DRUG_NAME.search(text):
            return False
    said = _preference_object(statement, _PREFERENCE_SHAPES)
    saved = _preference_object(content, _CONTENT_SHAPES)
    if not said or not saved:
        return False
    obj, kind = said
    if len(obj.split()) > _AUTO_OBJECT_MAX_WORDS or _PERSON_OBJECT.search(obj):
        return False
    # Same object, nothing added or dropped. The favorite's kind ("season")
    # may be restated in the content but is not required.
    said_terms, saved_terms = terms(obj), terms(saved[0])
    return bool(said_terms) and said_terms <= saved_terms <= said_terms | terms(kind)
