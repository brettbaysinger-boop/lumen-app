# Semantic memory indexing worker — disabled foundation increment

This increment adds a bounded authenticated worker but does not enable it.

- Uses the requesting user's access token.
- SQL remains authoritative for owner, companion, active state, revision and fingerprint.
- Embeddings go only to an explicitly configured private HTTP origin.
- Verifies the pinned nomic embedding digest before use.
- Batches at most 64 memories.
- Does not log memory text.
- Provider failure leaves the batch pending for retry.
- No daemon, auto-backfill, live retrieval switch, reranker, or service-role bypass.

The next increment can add an authenticated manual trigger and then shadow retrieval
after the production migration is separately backed up, applied and verified.
