# Lumen Assistant Services

This document describes Lumen's everyday-assistant direction and the structured
action system being developed around My Day.

## Goal

Useful things should stop disappearing into conversation history.

Lumen should be able to recognize when conversation contains information,
intentions, commitments, or plans that would be more useful as persistent
structured state.

The goal is not to turn Lumen into a generic productivity application.

The goal is for the companion to help naturally.

## Core experiences

### Post-deployment priorities (October 6)

The next browser patch fixes a reproduced ten-message rendering ceiling in the
conversation list. A thirty-message fixture loaded all rows from the database,
but FlatList displayed only its initial ten rows. Disabling virtualization alone
did not resolve it. Browser conversations now use a bounded ScrollView for all
loaded messages, while native clients retain FlatList. Verification covers all
thirty messages, continuing to send in the same conversation, reloading, a
390-pixel mobile viewport, and reaching the earliest message. Composer bounds
remain inside the viewport. This fixes display/rendering, not model context.
Very large histories still need paginated loading to avoid rendering an entire
archive at once and to work beyond the database response page limit.

Browser regression: export web with review-only localhost API configuration,
then run `node scripts/test-chat-scroll.cjs` with Playwright installed in the
test environment, or set `LUMEN_PLAYWRIGHT_MODULE` to its installed module path.
The script uses mocked authentication/database/API responses, not a live LAN.

Long-message and speech fixes are implemented in the next patch: composer and
API prompts accept 64,000 characters, generated replies have a configurable
8,192-token ceiling, and foreground generation/request timeouts allow longer
replies. Speech queues sentence-aware chunks of at most 500 characters, waits
for playback to finish before requesting the next, and stops the queue on
cancellation. Mid-reply errors are shown rather than silently treating partial
speech as completion. The per-request speech API limit remains 4,000 characters;
the UI queue supports longer replies without one giant synthesis request.

Prompt character limits do not increase the model's context window. Set
`CHAT_CONTEXT_LENGTH` separately for the selected model and available VRAM.
The existing default remains 8,192 tokens. Long input plus history and output
can exceed it. Large-document retrieval and context budgeting remain pending.
Chat bubbles already render full response text without a line clamp; if output
still ends mid-sentence, inspect the model finish reason and server logs.

Helios diagnostics: from `backend`, run
`PYTHONPATH=. .venv/bin/python ../scripts/diagnose-helios.py`.
The patch normalizes server URLs ending in `/v1` and falls back from the audio
model catalog to `/v1/models` on a missing catalog endpoint. Actual deployment
configuration and installed-model problems still need the Helios diagnostic
output. Do not expose backend secrets in pasted configuration.

Google, X, Apple, GitHub, Microsoft, and Facebook sign-in remain in the UI;
buttons appear only when local Supabase reports that provider enabled.

Account support is now implemented in the next development checkpoint. It uses
an explicit backend account-ID allowlist, a dedicated `/support` screen, limited
account records, ban removal, recovery email requests, and a service-only audit
table. Passwords and recovery links are not returned to the support account.
Users choose passwords through `/recover`. Support is disabled until configured.
See `docs/support-admin.md` for activation and mail delivery requirements.

The remaining requested capabilities are not implemented yet:

- Optional “Hey [companion name]”: local wake-word detection with a visible
  listening indicator, microphone permissions, mute control, and suppression
  during companion speech. Start with an open-app mode; closed-app/background
  listening requires platform-specific work. Do not use continuous cloud speech
  recognition for the self-hosted default.
- Internet tools: explicit local SearXNG search with saved source cards is
  implemented (`docs/web-search.md`). The research checkpoint reads bounded public
  page excerpts and synthesizes cited answers (`docs/web-research.md`). Whole-page
  coverage and download workflows remain future work.
  Local photo understanding is connected for selected models reporting vision
  capability; see `docs/vision.md`. The target is optional search and page retrieval through a configurable
  provider (self-hosted search supported), cited results, download review for
  printable CAD/STL files, and local vision for camera questions. Web content
  must remain untrusted tool data, without access to authentication secrets or
  authority to trigger unrelated private actions. Identification should state
  uncertainty and must not establish whether a snake is safe to handle.

### Implemented Take 2 checkpoint

The development build includes My Day tasks, reminders, notes, checklists,
projects and goals, source search, chat action cards, and an in-app due inbox.
Reminders needing clarification retain their request in conversation metadata
for 30 minutes. An immediate reply such as “PM”, “tomorrow at 9 am”, or
“in 30 minutes” completes the original request. “Never mind” cancels it.
Unrelated conversation clears this context. A bare “yes” does not schedule an
unspecified time. Saved reminders still use the caller's timezone and the
existing idempotent write path. No additional migration is needed for this
follow-up increment.

The gold/silver visual redesign, appearance controls, companion identity,
Helios voice selection, and camera capture are also in the development build.
Camera interpretation and private HTTPS mobile microphone/camera access have
been verified on main-llm-video. Closed-app notifications and external calendar
actions remain planned. Subsequent increments state their own deployment status.

Detailed acceptance criteria and installation notes for this checkpoint are in
`docs/assistant/ROADMAP.md` and `docs/assistant/INSTALL.md`; the root roadmap
remains the unified product roadmap.

### Private document retrieval checkpoint

The Take 2 feature line supports explicit PDF/TXT/Markdown imports, owner-scoped
full-text search, local cited answers and page inspection. Imports are scoped to
the companion. Deleting an import removes its indexed text, while prior quoted
chat replies remain. See `docs/documents.md` for limits and deployment. OCR,
semantic document search and connected drives remain future work.

Document action drafts now offer review/edit/save controls for source-linked
checklists, notes and follow-up reminders. Drafting does not save an item;
reminders require a user-selected future time. Saved items retain page references
and support Undo/Restore. See `docs/document-actions.md` for persistence, ownership
checks and deployment. On October 7, the user verified checklist drafting, note
review/edit/save and a saved follow-up reminder. The note shortcut uses the
verified short three-detail request.

### Remember what matters

Example:

"What was that movie Sarah recommended?"

Lumen should be able to find information the user remembers discussing without
requiring them to know whether it lives in a memory, note, task, project, or
older conversation.

Retrieval should preserve source/provenance where possible.

### Turn conversation into action

Example:

"I need to call the mechanic tomorrow."

Rather than letting that intention disappear, Lumen should be able to offer or
create an appropriate task/reminder.

The resulting action must be real persisted state, not merely prose claiming
that something was scheduled.

### Help plan the day

Example:

"What's on my plate?"

Lumen should synthesize what matters now.

Potential inputs:

- due tasks
- reminders
- projects/goals
- unresolved follow-ups
- commitments
- appointments after calendar integration
- relevant notes

The result should be concise and prioritized rather than a database dump.

### Capture everyday information

Examples:

- shopping lists
- gift ideas
- project notes
- questions for a doctor
- packing lists
- things to research
- recommendations from friends
- books/movies to check out
- household reminders

Conversation should be a natural capture interface.

### Help when the user is stuck

Lumen can use known context to help turn an unclear problem into manageable
next steps.

The user remains in control.

## Structured assistant state

Assistant state is distinct from conversational memory.

Current/planned object types include:

- tasks
- reminders
- notes
- checklists
- projects
- goals

A memory answers:

"What should Lumen remember?"

An action object answers things such as:

"What needs to happen?"
"When?"
"What is the status?"
"What list/project does it belong to?"

The same source conversation may create both kinds of state when appropriate,
but they should not be conflated.

## My Day feature line

A separate feature line has implemented an initial assistant-action foundation.

Implemented and validated there:

- tasks
- reminders
- notes
- checklists
- projects/goals
- conversational action cards
- Undo
- source-linked search
- reminder behavior

Reported validation for that feature line includes:

- 88 backend tests
- database validation
- desktop browser validation
- mobile browser validation

This work is not considered integrated into `feat/lumen-integration` until it
is merged and revalidated there.

## Action truth

A language model saying:

"I'll remind you tomorrow"

is not sufficient.

The authoritative sequence should be:

1. determine intended action
2. validate the request
3. persist the structured object
4. schedule/record reminder state when applicable
5. return an authoritative result
6. render that result to the user

If persistence fails, the UI must not present the action as successfully
created.

## Action cards

Conversation should represent successful structured actions distinctly.

A useful action card can communicate:

- action type
- title/content
- due time when applicable
- status
- associated project/list
- source
- Undo
- open/edit control

Cards should remain compact enough that conversation still feels like
conversation.

## Undo

Undo is a major trust feature.

Where a conversational command mutates state, the user should often have an
easy way to reverse the most recent mutation.

Undo is especially useful for:

- automatically captured tasks
- notes
- reminders
- checklist changes
- accidental interpretation

Undo behavior must operate on authoritative persisted state.

## Source links

Structured assistant objects should retain source information when useful.

Possible source references:

- originating message
- originating conversation
- manual creation
- imported/connected service
- future document/email/calendar source

Source links make retrieval and correction more trustworthy.

## Search

The long-term personal search experience should cross appropriate Lumen state.

Potential sources:

- conversational memories
- notes
- tasks
- reminders
- projects
- checklists
- conversation history
- generated media metadata
- future connected services

The user should not have to ask:

"Was that stored as a note or a memory?"

Natural retrieval should choose the relevant sources.

## Reminders

A reminder is a future-facing obligation for Lumen.

Requirements:

- persisted schedule/time
- owner scope
- visible status
- reliable delivery mechanism
- idempotent handling
- clear completion/cancellation behavior

Reminder scheduling must eventually survive API restarts.

## Tasks

Tasks represent work or intentions that can be completed.

Useful fields may include:

- title
- detail
- status
- due time
- priority
- project
- source
- created/completed timestamps

Do not require every field for casual conversational capture.

## Notes

Notes capture information that should remain accessible without necessarily
becoming a memory or task.

Examples:

- project thought
- recipe change
- gift idea
- appointment question
- research note

Notes should remain searchable and source-linked where possible.

## Checklists

Checklists support small grouped sets of items.

Examples:

- groceries
- packing
- errands
- project launch
- home maintenance

Conversation should support natural incremental updates.

## Projects and goals

Projects/goals provide longer-lived structure around related work.

Lumen should be able to connect tasks, notes, and follow-ups to a project
without forcing the user into project-management ceremony.

## My Day

My Day is the synthesis layer over assistant state.

Potential categories:

- now
- today
- upcoming
- overdue
- waiting/follow-up
- projects needing attention

The output should adapt to what actually exists.

An empty day should not produce fake urgency.

## Proactivity

Proactivity should serve clear user value.

Appropriate examples:

- reminder becomes due
- task deadline approaches
- user explicitly asked to follow up
- known appointment has relevant preparation notes
- unfinished commitment becomes relevant

Avoid:

- generic motivational spam
- repetitive nudges
- unexplained actions
- silently creating large amounts of structured state

## Capture policy

Not every sentence should become an object.

Potential behaviors:

- explicit request → create directly
- high-confidence obvious intention → offer or create according to user setting
- uncertain intent → ask/offer
- ordinary conversation → no action

The system should learn user preferences for capture behavior only through
explicit, inspectable configuration/state.

## Connections

Future assistant usefulness can expand through permissioned connections.

Potential integrations:

- calendar
- email
- contacts
- files
- task services

Connections should use least privilege and make source/action boundaries clear.

The user should understand when Lumen is:

- reading
- searching
- creating
- changing
- sending

## Privacy

Assistant state can contain highly personal information.

Requirements:

- account ownership
- RLS enforcement
- authenticated API access
- private-by-default storage
- explicit connector permissions
- backup protection
- no cross-account retrieval

## UI relationship

Assistant services primarily surface through Conversation and My Day.

Detailed object management can exist where useful, but the product should not
force the user to maintain Lumen like a task database.

Conversation is the natural command/capture surface.

My Day is the natural synthesis surface.

Search is the natural recovery surface.

## Integration priorities

When the My Day feature line is merged:

1. preserve existing account/companion ownership
2. apply migrations without resetting local data
3. reconcile with current `feat/lumen-integration`
4. run the complete backend suite
5. run TypeScript validation
6. validate database ownership/RLS
7. test desktop conversation/action cards
8. test mobile responsive behavior
9. verify reminders
10. verify Undo and source links

Only after that should the README status change from Feature branch to
Integrated.

## Future assistant work

After the foundation is integrated:

- better natural action recognition
- My Day prioritization
- calendar integration
- follow-up tracking
- recurring tasks/reminders
- semantic personal search
- source-linked retrieval
- richer project context
- controlled proactive assistance
- durable scheduling workers
- notification strategy
- connector framework

## North star

Lumen should make it easy to say something once and have it become useful
later.

The user should be able to think in natural language:

"Remember this."

"Remind me."

"Add that to the list."

"What was that thing Sarah told me?"

"What do I need to do today?"

"What were we working on?"

The system should handle the underlying structure without making the user think
like a database administrator.

## Secure mobile access

The HTTPS deployment checkpoint prepares private Tailscale HTTPS for the app,
API and Supabase gateway, preserving the existing Google callback. The web service
serves the exported build. Camera and microphone permissions can be requested
from the HTTPS app on mobile; see `docs/tailnet-https.md` for installation and
actual-device verification.

### October 7: ongoing practice and fast-note checkpoint

On October 7, the user verified the direct-JSON note fix at `63e3e62`, reported a major speed improvement, and pushed the branch and `lumen-take2-note-json-20261007` tag. The speed gain is user-reported, not a measured benchmark.

Goals & practice now links a My Day goal to focused chat sessions and explicitly
saved progress, corrections, vocabulary and next steps. New sessions use bounded
prior notes and user-selected practice preferences. Spanish is the first preset.
Cadence does not schedule notifications; minutes do not run a timer. The user
verified the original flow and reported the chat-save increment working; see `docs/goals-and-practice.md`.

## October 7: practice chat saves

On October 7, the user verified goal setup, practice, progress saving and continuity at `946b017`. After deploying `1006343`, the user reported that everything was working well, confirming the practice chat-save checkpoint. This is user-reported deployment verification; automated coverage is recorded separately.

Explicit save-session requests now summarize the bounded practice transcript and
finish the owned session, with a persisted chat receipt only after the write is
confirmed. Repeated saves reuse the record. Completed notes can be edited in
Goals & practice. Summarization failure uses labeled excerpts; failed writes do
not report success. Session notes remain separate from long-term memories.
See `goals-and-practice.md`.
