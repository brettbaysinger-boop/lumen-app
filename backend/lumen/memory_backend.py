"""Which memory store Lumen uses. Exactly one store is active at a time.

"supabase" (default): the existing Lumen memory tables and every existing
memory path, unchanged.

"rmc": chat memory reads and explicit "remember that" saves go to the
installed RMC through `lumen.rmc`. Every path that would read or write the
Supabase memory tables (natural updates, corrections, revision context,
automatic observations, semantic indexing) is switched off, so the two stores
can never diverge. There is no double-writing and no fallback: an RMC failure
is reported to the user as a failure.

Rolling back is setting LUMEN_MEMORY_BACKEND=supabase and restarting the API.
Facts saved to RMC while the flag was on stay in RMC and are not copied.
"""
SUPABASE = "supabase"
RMC = "rmc"
BACKENDS = (SUPABASE, RMC)


def memory_backend(settings) -> str:
    value = getattr(settings, "lumen_memory_backend", SUPABASE)
    if value not in BACKENDS:
        # pydantic already refuses this at startup; never guess a store.
        raise ValueError("Unknown LUMEN_MEMORY_BACKEND")
    return value


def uses_rmc(settings) -> bool:
    return memory_backend(settings) == RMC


def supabase_memory_enabled(settings) -> bool:
    return memory_backend(settings) == SUPABASE
