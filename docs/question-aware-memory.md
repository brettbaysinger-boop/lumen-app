# Question-aware memory retrieval — October 10, 2026

Candidate for feat/lumen-take2-local at e09f74a. Not deployed or user-verified.

Previously every turn received up to 12 memories ordered only by importance
and update time. Specific turns now rank a pool of up to 500 active memories
using the current message, content and saved topic tags. Matches precede
importance/recency fallback; ties keep database order. General memory listing
retains its 12-memory limit. Owner authorization and companion/active filters
are unchanged. No extra model call, database write, migration or configuration
change. The caller can still request a larger limit using the existing API.

Limits: lexical matching plus conservative plurals and color/favorite spelling
normalization, not embeddings. Facts outside the bounded pool, earlier chat
transcripts, ambiguous references, automatic retries and temporal change
resolution are not addressed. Absence from this context does not prove a fact
was never saved. Existing automatic-save and review boundaries remain.

Acceptance after explicit deployment: save a synthetic fact; in another chat
ask a related question; verify correct attribution and answer. Test with more
than 12 competing memories, correction/deletion, unrelated questions and the
general memory-list command. Full host tests and browser acceptance pending.

## Host validation

Full backend suite: 373 tests passed. All 16 new tests passed. Deployment and browser acceptance pending.
