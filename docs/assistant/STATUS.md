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
| 8 | Ongoing goals | Projects/goals, practice preferences, linked sessions and explicit saved progress | Milestones, multilingual speech, routine scheduling |
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
- Goals & practice is implemented and locally checked; host verification of goal
  setup, tutoring, progress saving and next-session continuity is pending.
- Improve reliability across more real documents/models; retain citation checks.
- Extend practice into milestones and routine delivery after host verification.
- Closed-app reminder delivery, recurring schedules, calendars and wake-word
  activation remain future increments, not features of this checkpoint.

## Latest ongoing-goal increment

Goals & practice provides goal preferences, one open linked chat per goal,
explicit progress/correction/vocabulary notes, and bounded prior-session context.
Spanish presets support everyday or customer conversations. Duration and cadence
are preferences, not timers or scheduled notifications. See
`../goals-and-practice.md`.

On October 7, the user verified the direct-JSON note fix at `63e3e62`, reported a major speed improvement, and pushed the branch and `lumen-take2-note-json-20261007` tag. The speed gain is user-reported, not a measured benchmark.
