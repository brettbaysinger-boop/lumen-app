> **Canonical project checkpoint:** [Project Status](../PROJECT-STATUS.md).

# Take 2 delivery status — October 7, 2026

| # | Action item | Delivered foundation | Next increment |
|---|---|---|---|
| 1 | Remember what matters | Owner-scoped keyword search of memories, messages, and notes with source navigation | Semantic retrieval, stronger recall evaluation |
| 2 | Conversation into action | Explicit commands, persisted cards, undo, clarification/cancellation; reviewed document action drafts | More natural phrasing, named-item editing in chat |
| 3 | Plan the day | Saved agenda, due inbox, completion and rescheduling | Focused daily plans, optional check-ins, calendar connection |
| 4 | Capture everyday stuff | Notes/checklists; edit/check/archive/restore; source-linked document drafts and concise note shortcut | Named-list additions in chat, faster capture UI |
| 5 | Help when stuck | Work on it together sends saved context into a chat draft | Saved step-by-step work sessions and progress updates |
| 6 | Use the camera practically | Mobile HTTPS camera, microphone, local vision routing and photo understanding verified by user | OCR and richer layout extraction |
| 7 | Communication help | Existing model can draft/rehearse; notes persist drafts | Draft workflow, revisions, optional confirmed external sending |
| 8 | Ongoing goals | Projects/goals, practice preferences, linked sessions, chat-requested saves and editable progress | Milestones, multilingual speech, routine scheduling |
| 9 | Find own information | Private PDF/text import, cited answers/page inspection, prompt attachment and library access | Semantic retrieval, OCR, connected drives |
| 10 | Shared fun | Existing persistent conversations, creative prompts, project/goal notes | Story/session bookmarks and repeatable activities |

First-release reminder channel is in-app, with optional browser alerts while the
app is open. Closed-app push and recurring notifications remain future work.
Local automated checks use test services and PostgreSQL/PGlite. Host confirmations
below were reported by the user, not performed directly from this workspace.

## Reported host checkpoints

- October 6: Google login, private HTTPS mobile microphone/camera and photo
  understanding; tag `lumen-take2-mobile-https-20261006` at `78428cb`.
- October 6: mobile Tailscale paperclip photo/PDF analysis; tag
  `lumen-take2-mobile-documents-20261006` at `ea6a562`.
- October 7: document checklist generation; note review/edit/save to My Day;
  follow-up reminder saved with America/Phoenix time. The longer note request
  failed schema validation; the short three-detail request worked. The shortcut
  now uses that tested request.

## Next work

- The direct-JSON note fix was subsequently verified fast and working by the user
  at `63e3e62`, then pushed/tagged. See `../document-actions.md`.
- The user verified goal setup, practice, saving and next-session continuity at
  `946b017`, and reported the chat-save increment at `1006343` working after deployment.
- Improve reliability across more real documents/models; retain citation checks.
- Extend practice into milestones and routine delivery.
- Closed-app reminder delivery, recurring schedules, calendars and wake-word
  activation remain future increments, not features of this checkpoint.

## Latest ongoing-goal increment

Goals & practice provides goal preferences, one open linked chat per goal,
explicit progress/correction/vocabulary notes, and bounded prior-session context.
Spanish presets support everyday or customer conversations. Duration and cadence
are preferences, not timers or scheduled notifications. See
`../goals-and-practice.md`.

On October 7, the user verified the direct-JSON note fix at `63e3e62`, reported a major speed improvement, and pushed the branch and `lumen-take2-note-json-20261007` tag. The speed gain is user-reported, not a measured benchmark.

## Explicit chat-save increment

On October 7, the user verified goal setup, practice, progress saving and continuity at `946b017`. After deploying `1006343`, the user reported that everything was working well, confirming the practice chat-save checkpoint. This is user-reported deployment verification; automated coverage is recorded separately.

Session summaries are generated only after explicit save intent. Save receipts
follow confirmed writes; failed summarization uses labeled literal excerpts.
192 backend tests pass, with mobile-sized browser coverage for editing and saved
receipts. No new migration is required.

## October 8: everyday capture

Explicit chat commands now append to named open lists, save gift ideas and capture
quick notes in My Day. Saved cards expose the captured text and link to editing.
Owner-scoped atomic appends retain retry receipts and reject ambiguous list names.
Local verification: 198 backend tests, typecheck, clean web export and capture SQL
checks. The user reported the corrected capture flow working on October 8 at `6e1260e`. See `../everyday-capture.md`.

Capture host testing found missed greeting, period and smart-quote forms despite
working eggs capture/list read. These inputs now have regression coverage. The
fix also guards generated list/note save claims and replaces unrelated-memory
fallbacks with a no-save reply. Local checks: 200 backend tests, typecheck and
clean web export. The user reported the fix working on October 8 at `6e1260e`; no new migration.

## October 8: help when stuck

Workstream #5 adds editable small-step drafts from explicit chat requests. Saving
creates a My Day project; the card shows one unfinished step with durable
completion and reload continuity. Duplicate completions cannot advance the next
step. No timer, automatic scheduling, or external work is performed.
Local checks: 207 backend tests, typecheck, clean web export, migration/RPC privacy
and persistence checks, and a mobile-sized mocked browser flow. On October 8, the user reported the deployed flow working at `eb7cea4`. See `../getting-unstuck.md`.

## October 8 verified-use checkpoint

The user reported the small-step flow working after deploying `eb7cea4`, following
the requested checks for draft review/save, step completion, reload continuity and
My Day editing. The user also reported daily Lumen use with an active shopping
list and reminders. This records continued practical use, not a measured reliability
rate or verification of closed-app notification delivery. Local automated coverage
remains 207 backend tests plus typecheck, clean web export, SQL and mobile-sized
mocked browser checks. No application changes or new migration in this checkpoint.
