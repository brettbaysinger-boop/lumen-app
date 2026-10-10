# Proposal PDF export - first integration candidate

Based on supplied local checkout feat/lumen-take2-local at 7f1ec2a.
This candidate adds branded rendering of the existing edited title/body draft.
It does not implement the structured rodent-template editor, photos, site plans,
service-template persistence, or automatic service-specific clause selection.
Do not describe the complete proposal template milestone as finished.

The web draft card offers Preview proposal PDF for note drafts. Non-proposal
notes are rejected by the backend. The preview and download use the latest
edited title/body; edits invalidate the prior preview. Saved cards currently
use their existing My Day view, so export must occur before Save to My Day.
The existing editable-text download and reviewed save remain available.

POST /v0.6/documents/companions/{companion_id}/drafts/{message_id}/pdf
requires authentication, owner-scoped companion/message lookup and accessible
source documents. It reads saved excerpts and the original preceding user
request rather than trusting client-supplied sources. It reruns the existing
Proposal schema, citation and input-price validation on edited title/body.
An edited price outside the original request/excerpts is rejected; submit a
new proposal request to authorize different prices. The route performs no
inference, database writes, storage uploads or scheduling. It renders in a
worker thread and returns a PDF with no-store caching. No private error bodies
or generated text are logged. Body markup is escaped, and remote assets are
never fetched. Source references are included for review, without old excerpt
text. Reference filenames may identify old customers; export remains a review
draft rather than a clean final customer contract.

PDF formatting preserves existing prose and citations. It does not independently
verify claim support, price arithmetic, service applicability, or warranty meaning.
In particular, the previously observed termite-to-rodent clause carryover still
requires correction before accepting a real customer proposal.

ReportLab >=4.2,<5 is the only new runtime dependency. Company logo is bundled
as package data. No migration, provider change, model change or Helios change.

Verification in an isolated source workspace: seven synthetic backend tests
passed, both rendered PDF pages visually inspected, and source installer anchors
and dependency metadata checked against a reference copy. Full host tests,
TypeScript, web build, deployment and browser acceptance remain pending.

Acceptance: export a synthetic existing proposal draft; edit it and confirm PDF
updates; remove citations and alter an unsupported price and confirm rejection;
verify other-owner/message and deleted-source denial; confirm text download and
My Day save still work. Then correct and inspect a real proposal privately.
Update PROJECT-STATUS and the existing handoff with the verified outcome, keeping
all existing local edits and Supabase/backup files intact.
