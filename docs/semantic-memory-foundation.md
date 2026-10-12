# Semantic memory foundation — source preview, not deployed

Baseline: `807e0bb59b89811f66c29525426438188beedec9` on
`feat/lumen-take2-local`. No existing application file is replaced in this increment.

## Decision from the host evidence

The CPU embedding trial recovered all 15 required query-memory matches within
the top three in its small synthetic corpus, but included unrelated candidates.
The MiniLM-L6-v2 reranker trial did not improve selection enough for use as a
production memory filter. Brett's subsequent input audit reports published
reference agreement, batch/singleton consistency, correct BERT pair segments,
and reproduced results. Moving/removing metadata did not resolve the failures.
This closes this particular input-format investigation. It does not establish
that all rerankers fail or that candidate retrieval alone is production ready.

`nomic-embed-text:v1.5` remains the initial embedding candidate, with the exact
768-dimensional profile and manifest digest recorded in `semantic_index.py`.
MiniLM is not imported, installed, started, or used by this source increment.

## Added implementation

- `public.memory_embedding_profiles` identifies the exact model digest,
  dimension, preprocessing, task prefixes, normalization and context setting.
  App roles can read profiles, not register or rewrite them.
- `public.memory_embeddings` stores derived vectors separately, keyed by memory
  and profile. The indexed revision and a database-generated content/metadata
  fingerprint bind each entry to its source. The old `vector(1536)` is untouched.
- `lumen_pending_memory_embeddings` provides bounded owner-scoped work snapshots.
  It omits current entries, so repeated successful batches can advance without
  an importance-first 500-record window. A later worker needs retry/backoff and
  handling for bad/oversized records; this is not a durable job queue.
- `lumen_store_memory_embedding` checks authenticated ownership, companion scope,
  active status, expected revision/fingerprint, profile and vector shape/norm.
  It returns indexed/already_indexed/stale/inactive. The source is SHARE-locked
  under a companion SHARE lock during the guarded write. It never updates a
  memory or its correction receipts. Concurrency stress tests remain pending.
- `lumen_match_memory_embeddings` returns exact cosine **candidates**, retaining
  subject, source and timestamps. Authorization, active status, profile and
  current revision/fingerprint are checked before distance calculation/top-k.
  Inactive/stale vectors are also hidden by direct SELECT RLS.
- `SemanticIndex` is an explicitly called Python RPC adapter. No running route
  imports it. It does not start an embedder, queue a worker or alter chat behavior.

The new write function is SECURITY DEFINER with explicit auth.uid/ownership
checks, a fixed empty search_path, schema-qualified references and restricted
EXECUTE grants. Pending/search functions remain SECURITY INVOKER. App roles
cannot write the tables directly. The service-role bypass is deliberately not
an indexing interface; the future worker's credential model needs a separate
review. Database administrators still control the underlying self-hosted data.

The SQL detects the installed pgvector extension namespace rather than assuming
public versus extensions. It does not install, move, or upgrade the extension.
No approximate vector index is added; start with exact search for the current
small corpus. Exact *distance* retrieval is not perfect *semantic* relevance.

## Validation included

Python contract tests exercise profile identity, preprocessing, vector checks,
explicit RPC payloads, revision receipts, duplicate rejection and attribution.
Those mocks are not SQL security tests.

The isolated SQL runner reads ONLY a local running `supabase_db_` container's
ID and image ID. It does not exec into that container. It starts a NEW container
from that immutable installed image with no pull, no network, no published
ports, no existing volumes, a read-only root filesystem, tmpfs test storage,
no added capabilities, 2 CPU quota, 1 GiB memory and no container swap.
The image's regular entrypoint is bypassed. A new PostgreSQL cluster is initialized
under /tmp and receives only synthetic SQL via stdin/private Unix socket.

It loads three checksum-verified existing migrations: core, accounts retry and
memory corrections. A test-only auth.uid function maps a session claim to UUID;
real PostgreSQL roles and RLS execute, but HTTP JWT signature verification,
PostgREST and the full Supabase migration history are NOT tested by this fixture.

59 SQL assertions run with vector in public, and again with vector in extensions.
They cover revision-safe indexing, actual correction/Undo, inactive/reactivated
records, delete cascade, two owners, multiple companions, anonymous denial,
RPC/table ACLs, multiple vector dimensions and a low-priority target behind
more than 500 competing records. Stored vectors are synthetic unit vectors:
these are database tests, not another model-quality measurement.

The runner removes only its own newly created labeled container and verifies
that removal. Ordinary errors/interruption use cleanup; SIGKILL/power loss can
prevent it. Logs/report stay in the private preview directory. No production
migrations, backfill, model loading or service restarts happen in this check.

Native PostgreSQL/pgvector and Docker are unavailable in the assistant execution
environment. Python tests can run there; the real SQL checks must run on Video.
A missing executable/image prerequisite or SQL failure is a stop, not a pass.

## What remains before any user-visible change

1. Pass the isolated native SQL checks and inspect any failures.
2. Review the additive patch, full backend regression suite and migration order.
3. Add a bounded CPU embedding provider/worker with explicit local credential
   handling and no secret/private text logging; index into derived rows only.
4. Validate on a restored database or explicit test accounts, including actual
   JWT/PostgREST ownership and correction/deletion races. Take a verified backup
   before applying any production migration.
5. Compare retrieval and grounded answers in an opt-in preview or shadow path.
   Candidate recall, final selection, no-answer behavior and answer support are
   separate acceptance criteria. Reranker/relevance policy is still unresolved.
6. Enable live retrieval only after acceptance, with an explicit off switch and
   an understood lexical fallback. Do not infer 'never saved' from no candidates.

Do not conflate this source foundation with an improved live companion. The
live UI, reminders, chat naming, voice, FLUX, existing Ollama servers, Forge,
Supabase settings and memories are unchanged.

## Primary design references

- https://github.com/pgvector/pgvector — exact search and filtering
- https://www.postgresql.org/docs/17/sql-createfunction.html — invoker/definer privileges
- https://www.postgresql.org/docs/17/ddl-rowsecurity.html — row-level security
- `supabase/migrations/20261010190000_memory_corrections.sql` — existing revision/Undo contract


## October 12 — Disposable test-runner binary discovery repair

The first Video run passed the 51 distinct Python tests but stopped before SQL
execution with "PostgreSQL initdb not found in installed image". This is not a
SQL assertion failure or a production migration. That preview and its logs must
be retained.

The original launcher probed only three conventional installation layouts. It
missed Supabase's non-versioned /usr/lib/postgresql/bin layout and active Nix
profiles. The revised runner checks the image's PATH, pg_config --bindir, active
profile aliases, then bounded known layout globs. A candidate must provide all
four tools (initdb, pg_ctl, postgres, psql). Ambiguous fallback installs fail
closed. No filesystem-wide search, install, image pull, or live-container exec
is introduced. The chosen binary directory is recorded on success; failures
surface both stdout and stderr so initdb's own diagnostic is not hidden.

The new shell tests reproduce the old discovery failure on a synthetic
non-versioned layout and exercise PATH, pg_config, Debian, Nix, incomplete and
ambiguous suites, plus SQL stdin preservation using fake binaries. These are
launcher regression tests, not real database tests. The migration, SQL assertion
suite, adapter and adapter tests are byte-for-byte unchanged. Native SQL
validation remains pending on Video, using a new disposable container.

Primary references for binary discovery:
- https://github.com/supabase/postgres/blob/develop/Dockerfile-supabase
- https://www.postgresql.org/docs/17/app-pgconfig.html
