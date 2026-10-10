# Conversation effort and document work

## Scope

This increment implements per-chat-view Quick, Think deeper and Model default
controls, plus a bounded document proposal workflow. It is not an autonomous
agent, a claim of consciousness, or an assurance of lifelong memory retention.
Identity and memory storage are unchanged; they are independent of effort mode.

Boolean thinking control is enabled only for the exact model tested by the user:
`satgeze/gemma4-12b-uncensored-1.5m:latest`. Quick sends `think:false`; Think deeper
sends `think:true`; Model default omits it. Other models omit the override even
if a client requests it. The UI disables unverified controls. Refresh effort
support after changing models. Quick starts selected for a supported model;
the choice is local to the mounted chat view, not a persisted account preference.
Older clients omit effort and retain model defaults. Structured document workflows
keep their own settings. Direct image generation does not use a chat effort option.

## Evidence

On October 9 (Phoenix), user testing on Video showed roughly 62 tokens/second with
default reasoning, but all three synthetic runs hit a 512-token cap before visible
text. These were incomplete samples. With `think:false`, first visible text arrived
in 0.072–0.114 seconds and complete 79-token answers in 1.309–1.349 seconds, all
normal stops. This establishes one task's speed improvement, not overall quality,
live app latency or voice performance. Video remains on text, Heavy on images;
Helios and routing configuration are unchanged.

## Work harder: proposal review draft

Attach a PDF using the existing paperclip, then choose **Work harder · improve this
document**. Edit the suggested request if desired and send. Explicit requests such
as “Draft a bid from this document” also use the workflow when document retrieval
is active. It does not operate on image attachments as a proposal workflow.

Three sequential model calls draft, check against retrieved excerpts and revise.
Activity messages expose these stages. Each call has a 4096-token budget and
180-second provider timeout. No unbounded planning loop or external action occurs.
Only the final valid proposal becomes an editable note draft. Existing owner-scoped
draft saving persists it in My Day after review. The web UI can download the edited
text, including source excerpts, before saving. This is plain text, not PDF/DOCX;
formatted document export and broader work tasks remain future milestones.

Sources are untrusted data. Prompts require preserving scope, prices, warranty
limitations, exclusions and dates; missing facts must be marked for confirmation.
Validation checks output shape, citation numbers and newly introduced dollar
amounts. The same model performs the review: this is not independent verification
or proof of factual completeness. A failed stage returns no actionable proposal
draft. A failed final check does not fall back to presenting the unchecked draft.

Current retrieval uses at most six excerpts. The UI explicitly warns that coverage
may be partial. Users must compare the proposal with the original before use.
The workflow does not send proposals, sign documents, schedule work or change
prices on the user's behalf. It improves structure and wording within the supplied
scope; better quality is an acceptance criterion, not a guaranteed outcome.

## Deployment and acceptance

No migration or dependency change. Rebuild web with existing HTTPS API addresses,
restart API and web. Test Quick then Think deeper on the tested Gemma model, and
Model default on another model. Test ordinary conversation, memory recall and
images for regressions. Attach a small bid PDF, use Work harder, inspect activity,
edit and download the text with references, then save to My Day and reload.
Check that prices, exclusions and warranty limitations remain faithful.

Local verification and live acceptance are separate. This increment is not yet
user-verified. Future work: stronger whole-document coverage, independently checked
facts, formatted exports and resumable task execution with bounded permissions.

## New project details and preferred templates

The user clarified that document work must support entirely new projects, not just
rewriting an old bid. This increment accepts explicit new customer, scope, price
and date details in the request as replacements for the reference bid. It instructs
the model not to reuse old customer details in a new project and to distinguish new
user-supplied facts from source citations. Price validation permits amounts found
in either the excerpts or the current user request; it does not verify arithmetic
or guarantee that every replacement was applied correctly. Review remains required.

The attached document can guide organization in this request. Persistent approved
templates, remembered formatting preferences and visual layout reproduction are
not implemented yet. These are the next part of the document workflow, together
with PDF/DOCX export. The current deliverable remains editable plain text.
