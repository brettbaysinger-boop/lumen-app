# Lumen Product Design — Take 2

This document captures the current product and UI direction for the Take 2
Lumen interface.

It is intended to be the handoff document for continued UI work.

## Product feeling

Lumen should feel like a personal companion first and an AI control panel
second.

The interface should feel:

- personal
- warm
- capable
- intimate without becoming cluttered
- premium
- understandable
- responsive
- alive without being distracting

The design should reveal technical controls when useful without forcing the
user to think in terms of models, endpoints, database tables, or GPU nodes
during normal interaction.

## Primary information architecture

Take 2 separates the product into five major concepts:

1. Conversation
2. Companion
3. Memories
4. Gallery
5. Settings

This separation is conceptual and should survive future navigation changes.

## Conversation

Conversation is where the relationship and immediate interaction happen.

It should support:

- text conversation
- streamed replies
- voice input
- voice playback
- generated images
- future generated video
- camera/media input
- documents
- contextual actions
- assistant action cards
- activity states
- useful follow-up suggestions

Conversation should not become a giant settings surface.

### Companion presence in conversation

Lumen should remain visually present in the chat.

Current direction:

- show a small Lumen portrait beside assistant replies
- allow the portrait to scroll naturally with the message
- keep message readability primary
- avoid a huge fixed portrait consuming conversation space
- avoid turning chat into a character-card dashboard

The portrait should reinforce who is speaking without competing with what she
is saying.

### Activity state

The interface can communicate what Lumen is doing through subtle states.

Examples:

- listening
- thinking
- speaking
- remembering
- searching
- creating an image
- creating video
- completing an action

These states should describe observable application activity rather than
pretending to expose hidden reasoning.

### Expressions

Longer-term, Lumen's portrait/presentation may have restrained expression
changes.

Start subtle.

Potential states:

- neutral/idle
- warm/happy
- focused
- listening
- thinking
- speaking
- playful
- concerned
- creating
- success/completion

Fluid animation/expression is a later enhancement. Do not make it a dependency
for the core Take 2 architecture.

## Companion

Companion is the place for Lumen herself.

This is not the same as Settings.

Companion should contain things that answer:

"Who is Lumen?"

Potential sections:

### Identity

- name
- gender/presentation
- basic identity configuration

### Appearance

- portrait
- persistent textual visual identity
- future canonical generation references
- future appearance testing/regeneration

### Personality / inner state

A user-facing home for persistent companion personality/configuration.

This must remain distinct from claims of consciousness or invented experience.

### Voice

Voice belongs here because it is part of how Lumen presents herself.

The UI should eventually allow selection among voices available through the
configured speech provider, currently Helios/Speaches.

The user should choose "Lumen's voice", not have to configure a Helios endpoint
inside the Companion screen.

### Conversation model

The selected model can remain configurable here and/or through a convenient
conversation control.

Changing the model must not imply changing Lumen's identity.

## Memories

Memories are things Lumen remembers.

The Memories experience should make persistent information inspectable rather
than magical.

Useful capabilities include:

- browse saved memories
- distinguish user / companion / shared / unassigned subjects
- inspect source evidence
- review uncertain observations
- edit/correct
- delete
- Undo recent automatic saves
- search
- eventually inspect conflicts/history

Do not place stable companion configuration such as visual identity in the
Memories UI merely because it is persistent.

## Gallery

Gallery is the media home.

The first version can build on generated images that already exist in chat.

Future capabilities:

- generated-image history
- larger media viewer
- metadata/provenance
- regenerate
- variations
- favorite/save
- reference-image management
- companion canonical references
- future user references
- future generated video

Inline chat media and Gallery should point to the same authoritative private
media rather than maintaining disconnected copies.

## Settings

Settings owns application configuration rather than Lumen's personal identity.

Examples:

- account
- authentication
- application appearance
- theme
- accent colors
- connections
- provider/infrastructure configuration
- privacy controls
- developer/advanced settings
- diagnostics

## Visual language

Current Take 2 direction:

- black
- charcoal
- gold
- silver/metallic supporting accents
- warm premium feeling

The interface should feel refined rather than sci-fi-for-the-sake-of-sci-fi.

Avoid excessive glowing panels, unnecessary HUD decoration, or visual noise
that makes Lumen feel like server administration software.

## Customization

Users should eventually be able to personalize:

- accent/theme colors
- portrait frame
- possibly background treatments
- other presentation details

Customization should not destroy contrast/readability.

Theme values should come from a coherent token system rather than isolated
hard-coded colors throughout components.

## Branding

The star logo is being retired.

Lumen herself should carry more of the product identity through:

- portrait
- name
- voice
- visual language
- interaction style

Brand decoration should support the companion rather than compete with her.

## Camera and multimodal controls

Conversation is the natural location for user-supplied context.

Future controls may include:

- camera
- image upload
- file/document upload
- audio
- eventually video

The controls should remain compact until invoked.

Avoid permanently filling the composer with every possible modality.

## Composer

The composer is one of the highest-frequency surfaces in Lumen.

It should prioritize:

- fast text entry
- obvious send behavior
- voice
- compact attachment/camera access
- clear generation/action feedback

Secondary capabilities can expand from compact controls rather than consuming
the default composer.

## Assistant actions

Structured assistant actions should appear naturally in Conversation.

Examples:

- reminder created
- task created
- note captured
- checklist updated
- project item added

Action UI should answer:

- what happened?
- what object was affected?
- when is it relevant?
- can I undo it?
- can I open/edit it?

Do not make successful actions indistinguishable from ordinary assistant prose.

## My Day

My Day is an experience, not necessarily a permanent top-level database-shaped
screen.

The user should be able to ask:

"What's on my plate?"

Lumen can synthesize relevant:

- tasks
- reminders
- projects/goals
- follow-ups
- appointments once connected
- recent commitments
- useful notes

The presentation should emphasize what matters now instead of dumping every
stored object.

## Search and retrieval

The user should not have to remember which subsystem contains something.

Natural requests such as:

"What was that movie Sarah recommended?"

should eventually search the appropriate personal sources.

Search results should preserve source/provenance when possible.

## Proactivity

Lumen should be helpful without becoming noisy.

Good proactivity:

- a due reminder
- an upcoming commitment
- an obvious unfinished follow-up
- offering to capture a task the user just stated
- relevant context for something about to happen

Bad proactivity:

- constant generic tips
- repetitive nags
- unexplained background actions
- silently changing important state

Controls for proactive behavior belong in Settings and/or the relevant
assistant-service configuration.

## Desktop and mobile

Take 2 should remain responsive rather than treating mobile as a shrunken
desktop.

Desktop can use more persistent navigation and context.

Mobile should prioritize:

- Conversation
- composer
- compact navigation
- touch-friendly actions
- media viewing
- clear back behavior

Avoid designs that require hover.

## Technical details versus product language

Prefer product language in ordinary UI.

Examples:

Use:

- "Voice"

rather than:

- "Speaches endpoint"

Use:

- "Appearance"

rather than:

- "`visual_identity`"

Use:

- "Remember automatically"

rather than exposing extraction-job terminology.

Advanced technical details can remain available in diagnostics/developer
settings.

## State truth

The UI should render authoritative state rather than imply success.

Examples:

- show Memory saved only after persistence succeeds
- show Reminder created only after the action exists
- show generated media only after storage/persistence succeeds
- show selected model from persisted companion configuration

Optimistic UI can improve responsiveness, but final state must reconcile with
the backend.

## Immediate Take 2 priorities

When UI development resumes:

1. Establish the five-area information architecture.
2. Refine Conversation around companion presence and readability.
3. Build the Companion surface around identity, appearance, voice, and
   personality/configuration.
4. Integrate the assistant-action/My Day work without turning the UI into a
   generic task manager.
5. Build Gallery from the existing generated-media pipeline.
6. Move app-level appearance/connections into Settings.
7. Preserve mobile responsiveness throughout rather than retrofitting it later.

## Design north star

Opening Lumen should feel like opening a space shared with a capable personal
companion.

The user should not need to care which model, GPU, or service made a particular
capability possible.

They should experience:

Lumen remembered it.

Lumen found it.

Lumen helped me do it.

Lumen made it.

Lumen is still Lumen.
