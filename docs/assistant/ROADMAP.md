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
