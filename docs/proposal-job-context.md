# Proposal context and generic export — candidate

Base: `feat/lumen-take2-local` at `2ba9ea9`.
Source provenance: user-supplied host code for runtime/document retrieval;
previously supplied proposal workflow and applied PDF candidate. The assistant
has no direct access to the host. GitHub's branch is behind the supplied source.

## Findings

Ordinary conversation receives recent messages. Proposal drafting previously
received only the current request and source excerpts. A request saying “use my
previous message” therefore lost the earlier job details. Selected-document
retrieval already scopes pages to the selected document; the evidence does not
show an automatic switch to a different document. The proposal branch also
omitted the selected document title from the action result.

The initial PDF renderer used a global company identity and logo. This is
unsuitable for a multi-user companion. The candidate uses a neutral PDF header,
footer and metadata. Existing logo assets are left intact but are not rendered.
Personal business branding settings are NOT implemented by this candidate.

## Bounded behavior

- A proposal explicitly mentioning “my/the previous/last message/request” can
  use the immediately preceding USER message in the same conversation.
- Assistant replies are never used to authorize job details or prices.
- Fresh requests do not inherit older jobs automatically. The helper does not
  skip intervening user messages, follow chains, or search other conversations.
- Missing, blank, oversized (over 4,000 characters), or chained prior requests
  produce a request for the full job details before retrieval or generation.
- Current instructions override prior details. The prompt distinguishes a new
  job from improving the same job, limits reuse to applicable service terms,
  and checks old identities in all sections including acceptance.
- The chosen reference remains pinned. Its title is preserved in the result.
- New successful drafts store versioned current/prior user-message IDs in
  assistant metadata, not a second copy of customer text. PDF export reloads
  the pinned user messages with companion, conversation, role and time filters.
- Export blocks when required context is missing. Older draft records retain
  the existing original-request validation path; they do not gain old prices
  from an unpinned conversation history.
- Citation, schema, source availability and price checks remain in place for
  draft, retry, final revision and edited PDF export. Token budgets and model
  selection are unchanged. No additional model call is introduced.

## Verification and limits

The isolated suite covers user-context selection, selected-document isolation,
draft/retry/review/revision context preservation, final checks, scoped PDF reads,
deleted context, no write operations in export, and neutral PDF output. The
provider is mocked; these tests do not establish semantic model compliance.
The full host suite and live synthetic model probe are required before deployment.

Applicability and old-identity instructions are model instructions, not a new
deterministic semantic validator. Existing same-model review is not independent
verification. A draft can still need correction. Prices present in inputs are
not proof of correct bundle arithmetic or correct assignment to a service.
The live probe intentionally includes unrelated old service terms and checks
for carryover; it cannot prove correctness for every possible job.

Future business features must belong to the authenticated user's workspace:
company identity, logo, reusable layouts, approved service terms and templates.
They must not become a shared companion persona or a global default. General
assistant capabilities remain available without a business profile.

No frontend changes, migrations, model/routing changes, dependency additions,
database resets, or service restarts are part of applying this patch.

<!-- proposal-context-host-validation-2026-10-10 -->
## October 10 — Host validation of proposal context candidate

User-supplied host evidence: 323 backend tests passed in 2.786 seconds.
Live synthetic rodent, termite and combined-job probes passed their
indicators, each using three model calls. The ant probe's keyword flag
was manually inspected: the draft explicitly excluded unrelated services.
Its customer, address and prices were correct.

The combined draft kept rodent workmanship and termite retreat terms
separate. These bounded examples do not establish universal semantic
correctness. No customer records were used by these synthetic probes.

Deployment and browser acceptance remain pending. The candidate uses
neutral PDF branding; owner-specific business profiles and logos remain
to be implemented.

<!-- proposal-wording-live-probes-2026-10-10 -->
## October 10 — Proposal wording candidate validated with installed model

Continuing from deployed a2cca68. Four user-run synthetic probes passed
through the installed OllamaProvider and full draft/review/revision flow,
using three calls each. Printed invented drafts were also inspected.

New-job examples did not import unapproved promotions. Explicitly approved
license information, service warranty limitations and the 10% price-match
offer were retained. Same-job offers survived. Supplied schedules were
not marked unconfirmed; unsigned acceptance fields remained blank.

The exact probed JOB_REFERENCE_RULES change is now applied locally.
Source selection, citation checks, price checks, final validation, model,
routing and call budgets are unchanged. No customer data is in fixtures.
The prior 60 isolated tests passed; full host-suite validation, deployment
and actual-request browser acceptance remain pending for this candidate.
These examples do not establish universal semantic correctness.

Persistent approved business defaults and exact example-layout matching
remain unimplemented. Existing private logo/style behavior is preserved.

<!-- proposal-wording-host-tests-357 -->
## October 10 — Proposal wording host validation

User-supplied host evidence confirms guarded application, clean whitespace
checks and 357 backend tests passing in 3.711 seconds. Four installed-model
synthetic probes previously passed, including explicit offer retention,
unapproved-offer omission, supplied schedules and blank acceptance fields.
This supersedes pending host-suite status. Deployment and actual-request
browser acceptance remain pending.
