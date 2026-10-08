# Getting unstuck: one small step

Workstream #5 now has a reviewed small-step plan flow. Ask in chat:

- `Help me get unstuck: my desk is covered in paperwork`
- `Help me break this down: prepare the information for a customer follow-up`
- `Good morning Lumen! Help me get unstuck. I need to organize my project notes`

A missing situation asks for clarification. Greetings, companion names, and
standalone command quotes use the shared capture normalization. Casual statements
still use ordinary chat; the command forms above activate this workflow.

The selected conversation model suggests a title, notes and one to five small
steps. Draft generation writes no My Day item, makes no schedule, and performs no
actions outside Lumen. Invalid or failed generation returns a no-save response.
The JSON prompt requests practical preparation/organization without invented
facts, deadlines or technical procedures. The suggestions are model-generated,
not verified professional guidance. Review and edit them to fit the situation.

Choose **Save small-step plan** to store an owner-scoped project in My Day. The
assistant message ID produces a stable request key; retries and reloads find the
same project without replacing saved edits. The chat retains the original draft.
Saved cards load current progress on remount and offer **Refresh progress** for
updates made elsewhere. Local edits to an unsaved draft are not retained on reload.

The saved card shows just the first unchecked step. **I did this step** saves its
completion before revealing the next step. You can stop interacting to pause;
there is no timer or pressure to finish. After all steps are checked, **Finish
plan** marks the project done. My Day shows the same card and supports editing the
full plan, reopening, or archiving through its existing controls. Progress counts
reflect checked steps, not elapsed time, mastery, or externally verified work.

Progress writes lock the owned project. Repeating a completion for the same step
is a no-op, cannot advance the next step, and does not replace other checklist
entries. The RPC checks the step text and order to reject stale edits and skipping
unfinished prior steps. A failed or uncertain write asks for a refresh; it does not
advance local progress. Whole-plan editing uses the existing checklist replacement
flow, so avoid simultaneous full-plan edits on multiple devices. Replacing a step with identical text cannot be distinguished by the text comparison.

## Implementation

- `backend/lumen/unstuck.py`: bounded structured generation, draft lookup/save.
- `/v0.8/unstuck/companions/{cid}/drafts/{message_id}`: owner-scoped saved status.
- The same path plus `/save`: explicitly save the reviewed plan.
- `my_day_items.step_mode`: projects shown one step at a time; ordinary items default false.
- `/v0.3/my-day/companions/{cid}/items/{item_id}/step`: guarded progress RPC.
- Migration `20261008200000_small_step_plans.sql`: project-mode constraint and invoker-rights completion function.
- `UnstuckDraft` and `SmallStepCard`: review, persistence and resumption UI.

No new runtime dependencies. Apply the migration before restarting the updated
API. Keep HTTPS service addresses in a clean web export for mobile access.

## Validation

Local checks: 207 backend tests, TypeScript, clean production web export, actual
PGlite migration/RPC tests, and a 390×844 browser flow with mocked authentication,
API and model output. Browser coverage includes draft edits, explicit saving, one
visible step, failed completion/retry, reload continuity, final completion and
My Day access. SQL covers owner and anonymous isolation, ordered updates, retry
idempotency, stale step text, and archive/reopen behavior. Backend checks cover
intent, schema limits, selected-model use, persisted draft metadata, no automatic
My Day/memory write, authenticated draft saves, scopes and uncertain progress writes.
On October 8, after deploying `eb7cea4`, the user reported that the requested
small-step flow worked. This is user-reported deployment validation with the local
model, separate from automated checks; it is not a general model-quality benchmark.

## Offsite deployment

From a device connected to your tailnet, copy the downloaded bundle to the server:

```bash
scp "$HOME/Downloads/lumen-unstuck.bundle" brett@100.75.227.45:lumen-unstuck.bundle
ssh brett@100.75.227.45
```

Then fetch the bundle from `~/lumen-unstuck.bundle`, fast-forward, apply the local
Supabase migration, typecheck, clean-export using the existing HTTPS URLs, and
restart the API/web services. This needs configured SSH access and Tailscale on
the connecting device. It does not change SSH, Google redirects, or Serve routes.

Test on mobile: request a paperwork plan, edit a step, save, complete the first
step, reload, confirm the next step remains current, then edit/review it in My Day.

## October 8 verified-use checkpoint

The user reported the small-step flow working after deploying `eb7cea4`, following
the requested checks for draft review/save, step completion, reload continuity and
My Day editing. The user also reported daily Lumen use with an active shopping
list and reminders. This records continued practical use, not a measured reliability
rate or verification of closed-app notification delivery. Local automated coverage
remains 207 backend tests plus typecheck, clean web export, SQL and mobile-sized
mocked browser checks. No application changes or new migration in this checkpoint.
