# Phase 2 — Independently labeled shadow memory retrieval benchmark

**Status (October 13, 2026, America/Phoenix): protocol proposed, not yet run.**
Phase 1a+1b are deployed and user-accepted in Firefox; application commit
`1a39432`. The semantic memory index exists but **does not influence chat
replies**. Both `semantic_memory_enabled` and
`semantic_index_after_chat` must remain `False` throughout Phase 2.

## Objective

Measure whether an authenticated end user's *specific companion* can retrieve
the right saved facts and abstain when no relevant memory exists. Establish a
reproducible and independently labeled baseline before changing ranking logic.

Do **not** mistake high embedding cosine similarity for answerability, or a
model-generated question for independent relevance evidence.

## Private data and immutable baseline

1. Read existing branch/commit, feature flags, embedder profile/digest, and
   existing live index. Never infer current database counts from the October 12
   rollout baseline; subsequent user acceptance may have saved new memories.
2. Choose an owner and that owner's companion using authenticated scope.
   A pilot companion previously had 97 active/current embeddings, but freeze a
   **fresh** snapshot with its exact active memory IDs, revision versions,
   source fingerprints, content/tags, and embedding profile IDs.
3. Store snapshot, query labels, outputs and raw memory text **only** under an
   access-restricted local private directory. No private memories, source
   messages, names, owner IDs, or embeddings in GitHub.
4. Record timestamp, snapshot SHA256, model and embedding profile ID,
   normalization/prefix settings, number of active/current/stale records, and
   query-set version in a separate local manifest. Refuse benchmarks if any
   sampled target changes revision during the run.
5. All benchmark operations are **read-only**. Do not write `memories`,
   `memory_embeddings`, `memory_suggestions`, or user conversation messages.
   Synthetic text stays local and does not become a conversation.

## Gold relevance labeling

For each question, record:
- user question and intended factual answer or `unanswerable`;
- query type: direct, paraphrase, indirect/reference, temporal/update,
  conflicting/ambiguous, or negative/control;
- **all acceptable memory IDs** (multiple relevant rows are allowed);
- information sufficiency: answerable, partially answerable, unanswerable,
  or ambiguous;
- label rationale with exact evidence links and reviewer identity/version;
- whether model generation originally proposed the question.

LLM-generated questions may be used as *drafts only*. An independent human
must verify each question against the actual frozen memories and approve all
valid gold positives; revise or discard ambiguous prompts. Do not let the
ranking model decide the gold labels. For absent-answer controls, verify
that no supporting memory exists in the full frozen scope.

Build a broad test set before tuning. Initial target: at least 60 reviewed
queries across categories, including direct recall, paraphrase, multi-hop or
reference resolution, stale/current facts, close duplicates, and unrelated
negative controls. The first 8-target/16-question experiment on the old
102-memory index was synthetic and **not** a validated benchmark.

Keep a small development set separate from a held-out evaluation set.
Once a query has been used to tune a ranker or threshold, do not report its
subsequent performance as untouched test evidence.

## Retrieval evaluation

Use only the owner-scoped read-only retrieval RPC from the shadow index.
For each approved query, record ranked candidate IDs, similarity scores,
subject, age, and evidence without disclosing private content in public logs.

Report, by query category and in aggregate:
- Recall@1/@3/@5 and MRR for answerable queries;
- multi-positive gold handling (any correct supporting memory counts);
- answerable/partial/ambiguous/unanswerable rates;
- negative-control false retrieval and score distributions;
- precision/coverage trade-offs for any abstention policy, with a threshold
  set on the development set only;
- failures grouped by ambiguity, duplicate evidence, subject mismatch,
  lexical mismatch, temporal conflict and missing information;
- bootstrap intervals when sample size permits; otherwise give raw
  numerators/denominators without false precision.

Ranking the correct memory does **not** establish that the companion's
answer generation will use it correctly. Measure reply grounding separately
and only after a controlled integration plan.

## Isolation and safety

- Verify unrelated owner authentication is denied.
- Verify a sibling companion belonging to the same owner cannot retrieve
  this companion's private memories.
- Test inactive and stale memories are excluded; do not temporarily activate
  or modify records to create tests. Use isolated fixtures when necessary.
- Keep the dedicated CPU embedder at `127.0.0.1:11435` and existing pinned
  model/profile, with correct query/document prefixes and L2 normalization.
- Never broaden companion scope to obtain a more favorable retrieval score.
- Never enable live semantic memory or automatic semantic indexing to run a
  benchmark.

## Output and go/no-go decision

A local private JSON/Markdown report should contain the frozen manifest,
human-labeled query set, per-question ranked results, missing/duplicate
explanations, isolation checks and aggregate metrics. Project Git docs may
record **only** non-sensitive aggregate results, methodology and known limits.

Only after a reproducible baseline should Phase 3 explore lexical retrieval,
entities, subject ownership, recency/temporal validity, evidence-quality
reranking and explicit abstention. Compare each incremental ranker to the
same frozen gold set, with a held-out evaluation set for final comparison.

A successful Phase 2 benchmark establishes **measured retrieval**, not
permission to deploy live RAG. Runtime rollout requires a separate security,
quality and user-acceptance gate.
