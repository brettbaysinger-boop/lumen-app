<!-- life-companion-direction-2026-10-09 -->
## October 9, Phoenix — Direction and honest document-work status

The user confirmed the product direction: a lifelong AI companion that learns
preferences and helps with real projects. Next acceptance milestone is approved
reusable document templates plus new project details and print-ready PDF output.
See docs/lifelong-companion-and-templates.md for design and acceptance criteria.

Work harder at 73e6751 failed on the user's real proposal after one generation;
it is not user-verified. Persistent templates and PDF rendering are not built.
A follow-up fixes reproducible currency notation rejection and adds stage-only
failure logging. Seven focused tests passed; live retest is pending. No schema,
frontend, routing or Helios change. Customer reference data remains outside Git.

Live follow-up: the user supplied `stage=draft_validation error_type=ValueError`.
This confirms failure after the first generation, not the specific check. A new
patch logs static reason codes distinguishing missing/unknown/malformed citations
from unmatched prices (including potentially legitimate computed totals). No model
output or customer data is logged. Validation rules are unchanged pending evidence.

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
