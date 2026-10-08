# Lumen: personal, helpful, engaging

Ten committed product workstreams. Ship through complete, reviewable increments,
with local storage and existing account isolation. This branch starts the shared
foundation; it is not a claim that all integrations are finished.

| # | Workstream | First deliverable | Completion evidence |
|---|---|---|---|
| 1 | Remember what matters | Search saved memories, conversation history, and personal notes with source links | A prior recommendation can be found and opened in its conversation |
| 2 | Turn conversation into action | Explicit chat commands create tasks and timed reminders | Saved card, due inbox entry, complete/reschedule, persistence after restart |
| 3 | Help plan the day | My Day agenda, overdue/upcoming items, optional planning conversation | Agenda matches persisted items and user's timezone |
| 4 | Capture everyday stuff | Notes and editable checklists | Add/check/edit items, reload, verify ownership |
| 5 | Help when stuck | Resume a task in chat with its saved context | User can ask for a small next step without re-explaining the task |
| 6 | Practical camera | Existing capture plus a vision provider and text extraction | Analyze a label or letter, show uncertainty, retain the chosen source |
| 7 | Communication help | Drafts as notes; rehearsal through conversation | Save/reopen/revise a draft; sending requires a separate deliberate action |
| 8 | Ongoing goals | Project/goal records, next steps, and progress | Reopen a goal, continue work, retain completed steps |
| 9 | Find local information | Selected-file import, extraction, local search, cited answers | Retrieve a warranty passage with filename and page; remove indexed file |
| 10 | Shared fun | Persistent creative sessions, stories and challenges | Resume a session from its saved conversation and notes |

## October 7 progress

Foundation A and major understanding C pieces are implemented on the Take 2
feature line. The user verified local vision/photo and PDF understanding, web
research, note review/edit/save and a follow-up reminder. Document checklist
generation also worked. The concise note shortcut now matches the successful
three-detail request. Broader reliability, OCR, semantic retrieval, routines,
calendar connections and closed-app delivery remain open. See `STATUS.md`.

## Release order

A. Shared foundation: My Day records and cards; explicit conversation actions;
local in-app reminders; source-linked history search; resume an item in chat.

B. Better follow-through: reliable full-text relevance and semantic retrieval;
editable daily plans, saved work sessions, proactive preference (on request,
gentle, active), and opt-in morning/evening check-ins. Model-suggested actions
remain proposals until intent is clear; explicit instructions need no extra
approval screen.

C. Understanding: local vision-model routing, attachment analysis, document
extraction/indexing with source citations and deletion controls.

D. Connections: calendar and optional external tools, reliable delivery beyond an
open browser, granular permissions, and an action log. External messages and
purchases are previewed and confirmed. Do not require confirmation for routine,
reversible task/list/note changes.

## Reminder delivery in release A

Channel: authenticated in-app inbox. The app polls while open. Due reminders
remain persisted and appear on return if the app was closed or the host was
unavailable. Optional browser notifications work while the app is open and the
browser permits them. Closed-browser/mobile push, recurring schedules, and
calendar appointments are separate delivery milestones, not implied features.

## Interaction contracts

- Memories are facts; notes are user-managed content; tasks are commitments.
- Creating an action acknowledges only a successful database write.
- Time is interpreted in the user's IANA timezone. Ambiguous times ask a question.
- Routine actions are reversible; completing or archiving preserves the record.
- Every record and search is scoped to the authenticated owner and companion.
- A camera attachment is not understood until a vision provider actually runs.
- Facial animation, consciousness, and proactive personality do not substitute
  for correct scheduling, retrieval, or clear user control.

## Ongoing-goal increment

Workstream #8 now includes practice setup, linked chat sessions, saved progress,
vocabulary and next steps. The user verified the original flow at `946b017`
and reported the chat-save increment working at `1006343`. Recurring delivery,
multilingual speech and milestones remain separate increments. The direct-JSON
fast-note fix has been verified and tagged by the user.

## October 7: practice chat saves

On October 7, the user verified goal setup, practice, progress saving and continuity at `946b017`. After deploying `1006343`, the user reported that everything was working well, confirming the practice chat-save checkpoint. This is user-reported deployment verification; automated coverage is recorded separately.

Explicit save-session requests now summarize the bounded practice transcript and
finish the owned session, with a persisted chat receipt only after the write is
confirmed. Repeated saves reuse the record. Completed notes can be edited in
Goals & practice. Summarization failure uses labeled excerpts; failed writes do
not report success. Session notes remain separate from long-term memories.
See `../goals-and-practice.md`.

## October 8: everyday capture

Explicit chat commands now append to named open lists, save gift ideas and capture
quick notes in My Day. Saved cards expose the captured text and link to editing.
Owner-scoped atomic appends retain retry receipts and reject ambiguous list names.
Local verification: 198 backend tests, typecheck, clean web export and capture SQL
checks. This increment awaits actual-device testing. See `../everyday-capture.md`.

Capture host testing found missed greeting, period and smart-quote forms despite
working eggs capture/list read. These inputs now have regression coverage. The
fix also guards generated list/note save claims and replaces unrelated-memory
fallbacks with a no-save reply. Local checks: 200 backend tests, typecheck and
clean web export. Host retesting of the fix is pending; no new migration.
