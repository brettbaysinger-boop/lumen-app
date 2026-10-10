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
