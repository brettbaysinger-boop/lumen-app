<!-- effort-work-2026-10-09 -->
## October 9, Phoenix — Effort controls and proposal workflow

Prior image-subject fix `205d6f7` is user-verified. User benchmarks established a
large reduction in synthetic answer latency with Boolean thinking disabled on the
installed Gemma model; default-reasoning runs were truncated, not complete answers.
See `docs/effort-and-document-work.md` for exact results and limitations.

Implemented: Quick / Think deeper / Model default controls, bounded to the verified
model; source-based proposal draft → check → revise workflow; editable text download
including references; existing reviewed save-to-My-Day flow reused. No migration,
Helios change or node reassignment. Six targeted effort/workflow tests passed;
full existing backend suite passed before the final additional payload test.
TypeScript, clean web export and mobile browser validation passed, including
effort selection, unsupported fallback and edited text download with source excerpts. Deployment and live user acceptance remain pending.

Work harder currently improves proposals from retrieved document excerpts. It is
not autonomous execution or formatted PDF/DOCX export. User review remains necessary
for prices, scope, warranties and missing source coverage. The broader lifelong
companion objective requires continued memory, identity and continuity work;
this increment does not claim to complete it.

User clarification: new projects must use explicit new customer, scope and price
details rather than only rewrite an old document. This increment accepts these
replacements. Approved reusable templates and persistent formatting preferences
remain the next part of this workstream; no automatic template memory is claimed.
