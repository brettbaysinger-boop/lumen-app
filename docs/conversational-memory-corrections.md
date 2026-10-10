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

<!-- memory-correction-browser-accepted-2026-10-10 -->
## October 10, Phoenix — Memory correction browser acceptance

38a5b87 was pushed and deployed with successful web build, active services,
and API/Ollama/database health OK. Host validation passed 408 backend tests
and TypeScript.

User verified correction visibility in Memories, updated dates, Undo,
persistence after reload, and restored-value recall in a new conversation.
A decorative overlay intercepted the delete control on important memories.
The pointerEvents="none" follow-up was applied; the user confirmed deletion
then worked and a fresh conversation no longer supplied the deleted value.

This closes the bounded correction/reload/Undo/deletion acceptance sequence.
It does not establish universal natural-language correction accuracy.
Deletion deactivates the saved memory; historical chat and revision records
are not erased by this control.

Remaining work: grounded handling of bare preference changes followed by
"yes update it"; more precise wording when no saved fact is available;
broader natural-memory acceptance and the original companion goal-list review.
Proposal work remains paused. Configuration and existing backups are preserved.

<!-- natural-memory-confirmation-candidate-2026-10-10 -->
## October 10, Phoenix — Grounded natural preference confirmation candidate

Continuing from pushed ae9c0b0. Prior browser acceptance covers correction,
reload, Undo, deletion and fresh-chat recall. Skills/language/website learning
is paused at the user's request; its separate scratch candidate was not applied,
pushed or deployed.

This candidate recognizes bounded first-person facts matching an existing
loaded user-memory attribute. A conflicting value produces an explicit proposal
containing the exact old and new text; no memory write or automatic observation
occurs for that proposal. "Yes, update it" (and bounded affirmative variants)
confirms only the immediately preceding persisted proposal and user assertion.
"No" cancels. Unrelated conversation expires the confirmation opportunity.
Missing proposals cannot be reconstructed from model-generated promises.

Confirmation rechecks owner-scoped active records, unique attribute/topic,
exact source-message identity, old text and revision version. The existing
atomic correction RPC supplies concurrency protection, revision receipt and Undo.
Retries recover confirmed receipts; already-undone requests are not reapplied.
No database, frontend, model/provider configuration or deployment change.

424 isolated backend tests pass, including a complete runtime two-turn flow,
proposal persistence, cancellation, stale/deleted/duplicate target refusal,
unverified assistant prose, request replay and write-time uncertainty.
The new route itself makes no model call. Full host validation and browser
acceptance remain pending.

Boundaries: lexical attributes and a matching memory in the current retrieval
context are required; this is not arbitrary semantic conflict resolution.
New unrelated facts retain the existing natural-memory observation behavior.
This does not add history erasure or temporal change inference.

<!-- natural-memory-confirmation-host-tests-424 -->
## October 10 — Natural memory confirmation host validation

User-supplied evidence confirms checksum verification, guarded application,
clean whitespace checks and 424 backend tests passing in 3.649 seconds.
This supersedes pending host-suite validation for this candidate.
Deployment and browser acceptance remain pending.
No migration or frontend build is required. Skills work remains paused.

<!-- natural-memory-season-alias-candidate-2026-10-10 -->
## October 10, Phoenix — Natural confirmation accepted; season wording follow-up

User-supplied host evidence confirms bd960b4 committed, pushed, API restarted
and API/Ollama/database health OK. Prior host validation: 424 backend tests.
Browser transcript confirms a bare favorite-season statement produced an
exact replacement proposal, plain "yes" produced a correction receipt,
and the user reports chat Undo restored summer.

Cancellation and fresh-chat recall of the confirmed new value have not yet
been separately reported for this increment. Earlier correction-flow acceptance
covered reload, Undo, deletion and fresh-chat recall.

The user also demonstrated "my favorite time is autumn" bypassing the
season conflict path and receiving unsupported speculative chat wording.
This follow-up matches favorite time/time of year to favorite season only
when the stated value is explicitly spring/summer/autumn/fall/winter.
Other times (e.g. morning or Christmas) ask for clarification when a
season memory is present. No season or preference is inferred from a question.

428 isolated backend tests pass: exact original wording, ambiguity refusal,
alias duplicate checks, and affirmative confirmation with the existing version
and receipt. Host validation, deployment and browser acceptance remain pending.
This remains bounded lexical matching, not arbitrary semantic interpretation.
No migration, frontend, provider or configuration change. Skills work is paused.

<!-- memory-season-alias-host-tests-428 -->
## October 10 — Season wording host validation

User-supplied output confirms checksum verification, guarded application,
clean whitespace checks and 428 backend tests passing in 3.738 seconds.
This supersedes pending host-suite validation for the season wording candidate.
Deployment and browser acceptance remain pending.
No migration or frontend build is required. Skills work remains paused.

<!-- memory-undo-context-candidate-2026-10-10 -->
## October 10, Phoenix — Season wording accepted; stale-chat Undo investigation

User-supplied evidence confirms ea8be99 pushed, API restarted and
API/Ollama/database health OK. Earlier host suite: 428 tests passed.
Browser transcript confirms season-alias proposals, cancellation, affirmative
save and clarification for morning. The user reports Undo restored summer in
Memories and a new chat, but the existing chat incorrectly answered autumn
and defended that answer. Do not record existing-chat Undo recall as accepted.

Code inspection confirms old correction messages enter history with their
original text, while the generic current-value precedence instruction is earlier
in the prompt. The model receives no explicit database Undo status in that history.

This candidate adds a current memory snapshot after historical messages,
including fresh owner/companion/conversation-scoped status for referenced
revision receipts and current associated memory rows. Undone or superseded
receipts are labeled historical; inactive memories are excluded from current
facts. A status lookup failure is marked unavailable rather than inventing Undo.
The persistent transcript is unchanged. No memory writes are performed by this check.

438 isolated backend tests pass, including Undo, current/superseded receipts,
inactive facts, unavailable state, identity filtering and context placement.
A synthetic installed-model probe covers same-chat Undo recall, a certainty
follow-up after a stale answer, and deletion with old history. Host suite,
installed-model probe, deployment and browser acceptance remain pending.
This context change is not a guarantee of universal model adherence.
No migration, frontend, model/provider configuration or backup change.
Skills/language/website work remains paused.

<!-- memory-undo-recall-followup-candidate-2026-10-10 -->
## October 10 — Undo context host probes and direct recall follow-up

User-supplied host evidence: guarded context candidate applied, whitespace
checks passed and 438 backend tests passed in 3.771 seconds.
The same-chat Undo synthetic answer used summer. The certainty answer corrected
autumn to summer but offered to reapply autumn. The deleted-memory probe failed:
the model invented an established morning preference and offered to save autumn.
No migration, commit or deployment was performed for that candidate.

This follow-up answers bounded direct saved-preference questions and
immediate certainty follow-ups from the checked current-memory snapshot.
The model does not select those current values. Inactive facts cannot become
current preferences from old chat. Missing facts are described as unavailable
current saved values; conflicting current values require review. Verified
Undo status can explain an earlier correction without soliciting restoration.
The historical transcript remains intact; no memory writes are added.

445 isolated backend tests pass locally, including the direct recall path,
certainty, deleted facts, subject ownership, conflicting entries, unsupported
queries and repeat follow-up metadata. Ordinary conversation still uses the
late current-memory context with explicit historical receipt status.

The updated synthetic host probe reports provider-call counts: direct recall
cases need no inference; an ordinary explanatory conversation case uses the
selected installed model. Host tests, probe, deployment and browser acceptance
remain pending. This is bounded recall routing, not universal semantic recall.
No migration, frontend, provider configuration or backup change.

<!-- memory-undo-context-host-validation-445 -->
## October 10, Phoenix — Undo-aware memory context host validation

User-supplied host evidence confirms guarded application, clean whitespace
checks and 445 backend tests passing in 3.742 seconds.

All four synthetic runtime probes passed. Same-chat recall after Undo,
certainty after a stale answer, and deleted-memory recall used zero provider
calls. Ordinary conversation used one installed-model provider call and
correctly recognized the restored summer value and undone autumn correction.
Database operations were mocked; no real memory writes were made.

Commit, deployment and actual same-chat browser acceptance remain pending.
No migration or frontend build is required. Skills and proposal work remain
paused. Existing configuration and backups are preserved.
