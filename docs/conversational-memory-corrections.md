# Conversational memory corrections

Candidate based on `db30595`, October 10, 2026 (Phoenix). Not deployed.

## Behavior

An explicit correction such as “Actually, my favorite color is blue” can update
one existing user memory without a separate approval step. A short correction
such as “No, it's blue” uses the preceding reply to identify the old value.
“That's wrong” asks for the replacement; a targeted clarification can accept
“Blue” on the next turn. Ordinary comments such as liking a blue shirt must not
change a favorite-color memory.

The selected conversation model interprets a bounded candidate set. Writes are
then constrained by exact user wording or a single evidenced value replacement,
matching personal attributes, subject, active status, and memory version.
Ambiguous, unsupported or duplicate targets require clarification or manual review.
This first increment supports possessive attributes (favorite color, name, etc.)
and simple live/work/prefer/like assertions. It does not promise arbitrary natural
language correction or merge multiple memories. Model interpretation remains
fallible and requires installed-model probes and live acceptance.

“Correction” marks an earlier entry as mistaken. “Change” records that the user
reported a change over time. Each private revision retains before/after values,
original source, conversation, request ID, exact source message text and reporting
time. Reporting time is not an inferred date when the real-world preference changed.
The current memory ID stays stable. Historical values are visible in View change;
automatic temporal-history retrieval is not part of this increment.

The chat receipt appears only after a confirmed database result. Undo restores
the prior text/source only if no subsequent memory edit or deletion occurred.
Every memory update increments its version, including manual edits, so changing
away and back cannot make an old Undo safe again. Repeating Undo is harmless;
retrying a correction already undone does not reapply it.

## Scope and limitations

- User memories only; companion identity, shared facts, documents and practice
  flows are excluded from automatic correction.
- Maximum 500 active user memories checked; 24 ranked candidates enter the parser.
  Larger collections require manual review in this increment.
- Current saved values take precedence over contradictory older chat messages.
- Correction turns do not also queue natural-memory extraction.
- One extra structured call only for detected correction turns or clarification.
- The receipt is durable even if later chat-message persistence fails. Retrying
  with the same request ID and conversation can recover it; full chat transaction
  atomicity and new-conversation retry recovery remain separate work.
- Source text is stored privately in revision history; it is not logged or added
  to model-training data. Deleting a conversation removes the revision's conversation
  link, not its memory history. Deleting a memory row cascades its revision history;
  the existing UI trash action deactivates the memory rather than physically deleting it.
- No new model, provider route or package dependency is required by the application.

## Validation and rollout

Isolated backend, SQL and component checks are included with the candidate.
`test-memory-corrections-model.py` uses invented inputs through the chosen local
model with every repository read/write mocked; it never connects to the database.
The browser test uses mocked endpoints and a web export; Chromium is required.
The optional component harness uses react-test-renderer 19.1.0 matching React.

Apply migration `20261010190000_memory_corrections.sql` only after host tests and
synthetic model probes pass, using the existing backup/migration workflow.
Then explicitly build/deploy web and API. Verify correction, cross-chat recall,
Undo/reload, changed-preference history, and ordinary comments. Keep unrelated
Supabase configuration, backup files and the paused proposal work intact.

## Candidate validation in the development workspace

402 backend tests passed; 30 isolated PostgreSQL checks passed; full TypeScript
check and Expo web export passed. The direct React component harness passed
Undo success/failure, reload, temporal labels, session switch and stale response
isolation. Browser automation could not run because Chromium download failed.
Full host tests, installed-model probes, migration, deployment and browser
acceptance remain pending. These are not claims of live behavior.

<!-- conversational-corrections-model-fix-2026-10-10 -->
## October 10 — Conversational correction model compatibility candidate

User-supplied host evidence: initial candidate passed 402 backend tests,
TypeScript and 30 isolated SQL checks. Installed-model synthetic probes failed.
Raw synthetic output showed correction/change misclassification, empty outputs,
omitted certainty, and a short value placed in the full-assertion field.

Process-only probes with reasoning disabled, explicit classification examples
and all schema fields required passed six of seven cases. The remaining temporal
case duplicated the new fragment in assertion. This follow-up recovers only
that exact duplication and still applies all existing fragment evidence,
attribute, certainty, ownership and revision checks. It does not infer certainty.

406 isolated backend tests pass, including recovery and rejection regressions.
Full host tests and installed-model probes of this final source remain pending.
No application migration, deployment or browser correction acceptance is claimed.
Configuration, backups and unrelated edits remain untouched.

<!-- memory-corrections-host-validation-406 -->
## October 10, Phoenix — Conversational corrections host validation

User-supplied host evidence confirms guarded follow-up application,
clean whitespace checks, and 406 backend tests passing in 3.630 seconds.
All seven installed-model synthetic correction probes passed:
direct, contextual, missing-value, temporal, casual, negative and hypothetical.
These probes used mocked database operations, not real memory writes.

Earlier host TypeScript and 30 isolated SQL checks passed. The follow-up
changed backend parsing/schema instructions and tests, not UI or SQL.
This supersedes pending host-suite and synthetic-model validation.
It does not establish universal natural-language correctness.

Application migration, deployment, browser correction, reload persistence
and Undo acceptance remain pending. Proposal work remains paused.
Existing configuration, backups and unrelated edits remain preserved.

<!-- memory-correction-visibility-candidate-2026-10-10 -->
## October 10, Phoenix — Deployed correction evidence and visibility follow-up

User-supplied host output confirms 4ea7cb0 pushed and deployed, migration
20261010190000 synchronized, successful web build, active API/web services
and API/Ollama/database health OK. A pre-migration database archive was
created and its archive list verified; no restore drill is claimed.
Prior validation: 406 backend tests, TypeScript, 30 isolated SQL checks,
and seven installed-model synthetic probes passed.

Browser transcript shows an explicit 'actually' correction produced a
Memory corrected / Undo / View change card. User reports the revised answer
survives reload. Undo itself and fresh-conversation recall remain unverified.
The preceding bare preference plus 'yes update it' exchange produced an
unsupported generated update claim without a receipt. Do not record that
exchange as a verified memory write.

Code inspection confirms Memories sorted/displayed creation dates and
refreshed proposals, but not saved entries, on tab focus. This follow-up
refreshes saved entries on focus and polling, sorts by updated_at, shows
created and updated dates, and exposes the latest revision card on each
saved memory, including Undo. Existing edit/delete controls remain.
It also detects unsupported ordinary-chat preference/memory mutation claims
and sends them through the existing rewrite guard.

408 backend tests, TypeScript and component checks pass locally, including
memory-linked latest-revision lookup, Undo refresh and account isolation.
Host validation, deployment and browser acceptance of this follow-up remain
pending. No migration or configuration change is required.
Bare assertions plus 'yes update it' still need grounded conversational
intent handling; this follow-up does not claim to implement that flow.

<!-- memory-visibility-host-tests-408 -->
## October 10 — Memory visibility host validation

User-supplied host output confirms guarded application, clean whitespace
checks, 408 backend tests passing in 4.086 seconds and TypeScript passing.
This supersedes pending host validation for the visibility follow-up.
Deployment and browser acceptance remain pending. No migration is required.
