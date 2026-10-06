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
Camera interpretation, closed-app notifications, and external calendar actions
remain planned. This checkpoint has not been deployed to main-llm-video.

Detailed acceptance criteria and installation notes for this checkpoint are in
`docs/assistant/ROADMAP.md` and `docs/assistant/INSTALL.md`; the root roadmap
remains the unified product roadmap.

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
