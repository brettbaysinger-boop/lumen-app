# Goals & practice — first ongoing-goal increment

This implements workstream #8 as a saved practice loop: goal setup, focused chat,
explicit progress notes, and continuity into a new session. Spanish practice is
the first preset, with everyday and pest-control customer conversation focuses.
Other goals can use a custom name and focus. Local checks are complete; host
verification of this increment is pending.

## User flow

Open **Practice** from the conversation header, **Goals & practice** from My Day
or Settings, or **Practice this goal** on a My Day goal card. The chat header
carries its goal selection back to the correct practice screen.

1. Choose **New goal**, edit its name, and **Create goal**. Existing My Day goals
   appear here too. Goal title/body/status are still managed in My Day.
2. Choose focus, self-selected level, preferred minutes and daily/weekly/flexible
   rhythm. Save preferences, or start practice to save the displayed preferences.
3. **Start practice** creates a linked chat and prepares a prompt. It does not
   send a message; choose Send to begin. **Resume practice** reopens the existing
   open session instead of creating duplicates.
4. Use the normal conversation screen. The selected local model receives the
   goal, session preference snapshot and bounded prior progress notes. Spanish
   tutoring instructions request one small exercise, gentle corrections, and a
   chance for the learner to try before revealing an answer.
5. Return to Practice. Enter what you tried, corrections to revisit, vocabulary
   and one next step; **Finish and save session** explicitly saves those notes.
   This does not mark the entire goal complete.
6. Reload to inspect saved progress or open the original practice chat. Starting
   again creates a new session that uses the latest preferences and prior notes.

The preferred duration is not a timer. Rhythm does not schedule reminders or
closed-app notifications. Use the existing My Day reminder flow for a specific
practice reminder. The model does not automatically infer progress, score
fluency, save vocabulary or complete goals. Session notes are user-entered;
unsaved edits are local state and are lost on reload.

## Continuity and limits

Each session has its own ordinary persistent conversation. Its preference
snapshot is immutable; changing goal preferences affects new sessions rather
than silently changing an ongoing one. A saved session stays completed; repeated
finish requests return the original saved record instead of overwriting it.
Continuing to chat in a completed session does not amend its saved progress.

The API lists the latest 100 goals and 100 sessions per goal; the screen displays
up to 20 recent completed sessions. New practice includes the latest three other
completed records. Context uses up to 1,000 summary characters, 500 correction
characters, 500 vocabulary characters, and 300 next-step characters per record,
plus up to 2,000 goal-note characters. In a practice conversation, eight recent
chat messages are included, capped at 1,500 characters each. This is bounded
continuity, not semantic recall of the entire course; stored records remain
available separately.

Profile: beginner/intermediate/advanced, focus up to 1,000 characters, preferred
minutes 1–60 (UI presets 5/10/15/30), and daily/weekly/flexible rhythm. Each saved
session allows 2,000 characters each for progress, corrections and vocabulary,
and 300 for the next step. Saved notes do not automatically become long-term
memories. Automatic memory observations are suppressed for practice chat;
explicit memory commands remain available.

This increment uses the existing selected model and chat voice controls. It
adds no speech model configuration or pronunciation scoring. The current English
Whisper model does not establish Spanish speech recognition support; multilingual
STT and Spanish TTS pronunciation need their own verification.

## Storage and ownership

Migration `20261008040000_goal_practice_sessions.sql` adds `goal_profile` to My Day,
`goal_item_id` to conversations, and owner-scoped `goal_sessions`. Row policies
and scope triggers prevent cross-account or cross-companion references.
Authenticated API routes under `/v0.7/goals/companions/{companion_id}`:

- `GET /` lists saved goals.
- `PATCH /{goal_id}/profile` saves practice preferences.
- `GET /{goal_id}/sessions` lists recent sessions.
- `POST /{goal_id}/sessions` atomically creates/resumes a session and conversation.
- `POST /{goal_id}/sessions/{session_id}/finish` explicitly records progress.

The `start_goal_session` invoker-rights RPC verifies ownership and locks the goal.
Conversation and session creation are one database transaction. A stable request
key handles retries; a partial unique index enforces one open session per goal.
Archived/completed goals must be reopened in My Day before a new start. Deleting
an entire goal removes session records and detaches its conversations, while
ordinary conversations/messages remain subject to their existing lifecycle.
Deleting a practice conversation removes its session record. Archives retain data.

## Deployment and checks

Apply the migration before restarting the new API. No new application dependencies
are required. Typecheck, rebuild with existing HTTPS API/Auth URLs and `--clear`,
then restart API and static web services. No Supabase Auth restart or Google
redirect changes are needed.

- Backend: ownership/validation, explicit finish/retry, selected goal continuity,
  profile constraints, and no automatic progress/memory writes.
- PostgreSQL/PGlite: real migrations, atomic start/resume, no orphan chats on retry,
  immutable profiles, completion/new-session continuity, RLS, cross-companion
  rejection, archive restrictions and deletion behavior.
- Production-export mobile-sized Chromium: creation/preferences, linked chat
  draft, resume, failed finish and retry, progress after reload, and new snapshots.

Host smoke test: create Learn Spanish, choose beginner and five minutes, start
and Send. Practice an introduction. Save a progress note and vocabulary, reload,
then start the next session and confirm Lumen uses the saved next step. Check a
second account cannot read the goal/session. Model lesson quality and actual
Spanish voice recognition are separate from mocked browser checks.
