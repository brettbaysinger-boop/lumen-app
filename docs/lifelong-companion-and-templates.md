# Raialume: lifelong companion and document continuity

Approved direction, October 9, 2026 (America/Phoenix).

## Product intent

A user-owned AI companion with continuity across years, devices and model changes.
It remembers useful preferences and corrections, assists with real work, and lets
the user inspect, edit, export and delete what is remembered. Warmth and personality
must coexist with honest limits. No claims of consciousness, guaranteed permanence
or completed actions without evidence. Reliability, backups and recovery are part
of this goal, not optional polish.

## Next milestone: approved document templates to printable proposals

User expectation: "Remember this as my proposal template. Here is the new customer,
job and price. Put it together so I can print it."

Acceptance criteria:
1. Import and preview a reference. Separate reusable visual design and company
   identity from the previous customer's private details and service-specific terms.
2. Save an explicitly approved, owner-scoped template version: branding, layout,
   tables, headers/footers, typography and relevant standard terms. Corrections
   update a reviewed version; they do not silently replace every template.
3. Extract new customer, project scope, quantities, prices, optional items and
   bundle conditions from natural language into an editable job record.
4. Ask only for material missing details. Do not carry old customer addresses,
   unrelated treatment methods, warranty terms or dates into a new job.
5. Calculate totals from selected line items using decimal arithmetic. Keep
   recurring maintenance separate from one-time totals. Tax and acceptance of
   optional services must be explicit rather than inferred.
6. Render a new PDF using the approved template, with a preview and editable source.
   Check page breaks, table wrapping, totals and customer details before export.
7. Keep provenance/source checks separate from the clean customer-facing proposal.
   Never automatically email, sign or schedule the proposal.
8. Reuse the template after reload/new conversation and enforce ownership across
   accounts. Support version history, export and restoration.

The supplied reference has a branded header/logo, green-and-cream tables, customer
information grid, itemized scope/pricing and repeating footer. Text extraction alone
cannot reproduce that layout. A rendering/template layer is required. Do not commit
customer PDFs, addresses, contact details or actual bid data into the public repo;
use synthetic fixtures for implementation tests.

## Current boundary and evidence

Provider visibility and image-subject correction were user-verified. Synthetic
reasoning-disabled conversation was markedly faster on the existing Video GPU.
Effort/workflow build 73e6751 was deployed far enough to execute the proposal request,
but the user's actual proposal attempt FAILED after one structured generation.
Do not label Work harder user-verified or successful. Effort-control live acceptance
has not been independently reported.

The current proposal feature operates on excerpts, yields editable text and uses a
same-model review pass. It does not save templates or produce formatted PDFs.
A reproducible validation issue rejects "price 595" when the model writes "$595",
and also previously treated "$595.00" as different from "$595". A follow-up
normalizes currency and recognizes explicit price-language amounts, while retaining
rejection of unsupported prices. The actual failed model output was not inspected,
so this is a confirmed code defect and plausible cause, not a proven diagnosis of
that particular request. Added stage-only error logging exposes no private content.

The full reference-template milestone remains planned. Complete it using structured
job data and deterministic rendering, not increasingly long generation prompts.

<!-- companion-memory-session-handoff-2026-10-10 -->
## October 10, Phoenix — Companion memory checkpoint and session handoff

Latest verified application commit: 19acf46.
Latest verified documentation commit before this checkpoint: 55a4c66.
Active host: aiLumen-llm-video, /home/brett/lumen-push.
Active branch: feat/lumen-take2-local.

Application evidence:
- 445 host backend tests passed after the extraction fix.
- 19acf46 was pushed, API restarted, and API/Ollama/database health reported OK.
- Explicit and natural corrections, confirmation/cancellation, saved-memory
  visibility, reload persistence, Undo and deletion have bounded user acceptance.
- Existing-chat direct recall, certainty and ordinary explanation correctly
  recognize the restored value after Undo.
- An ordinary explanation preference saved automatically and was recalled
  in a fresh chat.
- A hypothetical statement produced no visible saved memory or proposal.
- Failed extraction checks recovered after think=False was applied to
  background structured extraction. The UI reported no unfinished checks.
- Fresh-chat recall returned the ongoing project and its next step.
- A subsequent new memory populated automatically without pressing Retry.
- The user reported dismissal/removal stayed suppressed in the tested sequence.

Latest finding:
A differently worded project-continuation question recalled the general project,
but also surfaced unrelated personal preferences and omitted the concrete next
step. This establishes a relevance/answer-focus gap for that sample, not a
failure to persist all memories. Do not copy private conversation text into
public fixtures or documentation.

Next memory work:
Inspect retrieval and prompt/context composition using synthetic mixed-topic
fixtures. Measure selection of relevant project facts and next steps while
preserving appropriate preference recall in other conversations. Keep the
solution general across users, projects, hobbies and relationships; do not
hardcode this user's project or suppress entire subject categories.

Current boundaries:
Retrieval is bounded and lexical, not established semantic/temporal recall.
Recovered backlog accuracy and duplicate behavior have not been fully audited.
Project and next-step candidates can share a topic; real conflict checks may
leave a candidate for review. Remembered projects do not automatically create
My Day projects or Goals & practice records. Deletion deactivates memories;
historical conversations and revisions are retained.
Durable automatic retry, evidence-linked reflection and grounded companion
self-model improvements remain open. Consciousness is not established.

Paused workstreams:
Proposal/document work remains paused at its recorded checkpoint, including
approved business defaults and exact reusable example-layout matching.
Skills/language/website-learning expansion remains paused.

Fresh-session instructions:
Read the newest appended PROJECT-STATUS and SESSION-HANDOFF entries first.
Verify actual host branch, HEAD and worktree before editing; this handoff does
not authorize assuming host access or treating GitHub as local-state evidence.
The user intends to work on another app aspect in the next conversation.
Preserve supabase/config.toml changes and existing source/configuration backups.
No reset, clean, broad staging or automatic deployment.
