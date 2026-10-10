# Generic proposal PDF layout candidate

Baseline: user-supplied commit 252de5f on feat/lumen-take2-local.

The renderer formats existing validated text into a neutral proposal. Customer
and investment label/value rows become tables; Markdown tables retain their
rows and conditions. Embedded ReportLab Vera fonts provide consistent rendering.
Short acceptance blocks stay together. Long tables and oversized rows can split.
No model call, inferred total, new price, business identity or logo is added.

The reference appendix preserves citation numbers, document grouping and page
numbers while replacing source filenames with Reference document A/B labels.
Source excerpts and filenames remain available in the existing draft UI.
This is filename minimization, not redaction of private text in the draft body.

The authenticated export route, owner/source access checks, pinned request
context and existing proposal/price/citation validation are unchanged.
No frontend, dependency, model, configuration or deployment change is included.

Verification: 34 isolated tests passed, including eight new synthetic layout
regressions and existing route/context cases. Both synthetic preview pages were
rendered and visually inspected. The supplied draft was also inspected privately:
its proposal and acceptance fit one page, followed by the reference appendix.
No customer text is included in this bundle or its tests. Full host tests and
browser acceptance remain pending. The prior host baseline was 323 passing tests.

Remaining content issues are separate: unnecessary confirmation placeholders,
carried-over offers and approval of business terms require content-level work.
Owner-specific business profiles, logos and approved templates remain pending.
The renderer deliberately preserves those visible review items.

<!-- proposal-layout-host-tests-331 -->
## October 10 — PDF layout host validation

User-supplied host output confirms bundle checksum verification,
successful guarded application, clean whitespace checks, and 331 backend
tests passing in 2.885 seconds. This supersedes pending host-suite status.
Deployment and browser PDF acceptance remain pending.
