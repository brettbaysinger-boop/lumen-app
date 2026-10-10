"""Bounded lexical ranking; no inferred facts, writes or extra inference."""
import math
import re
import unicodedata
from collections import Counter

_STOP = set("a an the i me my mine you your yours we our us it its this that these those is are was were be been do does did have has had what which who whose when where how why can could would should please tell know remember recall about of for to in on at and or with from as something anything earlier previously again".split())
_ALIASES = {"colour": "color", "colours": "color", "colors": "color",
            "favourite": "favorite", "favourites": "favorite", "favorites": "favorite"}


def terms(text):
    words = re.findall(r"[^\W_]+", unicodedata.normalize("NFKC", text).casefold())
    result = set()
    for word in words:
        word = _ALIASES.get(word, word)
        if word in _STOP or len(word) < 2:
            continue
        # Conservative plural normalization, not unrestricted suffix stemming.
        if len(word) > 4 and word.endswith("s") and not word.endswith(("ss", "us", "is")):
            word = word[:-1]
        result.add(word)
    return result


def rank_memories(memories, query, limit=12):
    """Positive lexical matches first; preserve DB importance/recency as fallback.

    Input is already ordered and owner/companion scoped by the repository.
    Topic tags participate in matching. Ties preserve the database order.
    This is lexical recall, not semantic or exhaustive history search.
    """
    if limit <= 0:
        return []
    active = [m for m in memories if m.get("is_active", True) is True]
    query_terms = terms(query)
    if not query_terms:
        return active[:limit]
    documents = []
    for memory in active:
        tags = memory.get("tags") or []
        if not isinstance(tags, list):
            tags = []
        documents.append(terms(str(memory.get("content") or "") + " " +
                               " ".join(t for t in tags if isinstance(t, str))))
    frequency = Counter(t for document in documents for t in document)
    weights = {t: math.log(1 + (len(documents) + 1) / (frequency[t] + 1))
               for t in query_terms}
    def score(index):
        matched = query_terms & documents[index]
        return sum(weights[t] for t in matched)
    ranked = sorted(range(len(active)), key=lambda i: -score(i))
    return [active[i] for i in ranked[:limit]]
