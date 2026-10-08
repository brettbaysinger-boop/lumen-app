# Lumen

Lumen is a local-first personal AI companion platform built around persistent
identity, memory, multimodal interaction, useful everyday assistance, and
user-controlled local infrastructure.

Lumen is not intended to be merely a chat UI around a local language model.
The long-term product is a companion that can remember what matters, retrieve
information naturally, turn conversation into action, help plan the day,
capture everyday information, communicate through text/voice/images/video,
and preserve a stable identity even as models and hardware change.

## Current development state

Current deployed development branch:

`feat/lumen-take2-local`

Historical integration branch: `feat/lumen-integration`, documentation checkpoint
`e5f0197`. The Take 2 branch builds on that integration; it is not a claim that
the feature branch has been merged into the integration branch.

October 7 checkpoint: the user verified Google login across local/LAN/Tailscale,
mobile HTTPS microphone/camera/photo understanding, web research, photo/PDF
attachment analysis, and document actions. Checklist generation, note
review/edit/save to My Day, and a scheduled follow-up reminder were confirmed.
The direct-JSON note fix at `63e3e62` was verified working with a major reported
speed improvement and pushed/tagged. Goals & practice now adds saved preferences,
linked practice chats and explicit progress notes, verified by the user at
`946b017`. Explicit chat saving and editable saved notes are now implemented;
the user reported this increment working after deploying `1006343`. See
`docs/assistant/STATUS.md` for remaining work.

Current local verification: 200 backend tests, TypeScript validation, clean web
export, and document-action database/browser checks. Deployment reports and
automated checks are recorded separately in `docs/assistant/VALIDATION.md`.

The current integrated system includes:

- authenticated local accounts through Supabase Auth
- account and companion ownership enforced with row-level security
- persistent conversations
- selectable local Ollama conversation models
- streamed web conversation
- explicit long-term memories
- natural conversation memory observation
- conservative automatic remembering and review
- Helios speech-to-text and text-to-speech
- local ComfyUI image generation
- FLUX.2 Klein 4B FP8
- private generated chat media
- persistent companion visual identity
- companion-self image subject resolution
- original/resolved image prompt provenance

At the visual-identity checkpoint:

- 66 backend tests pass
- TypeScript validation passes
- live authenticated image generation is verified
- private generated-image persistence is verified
- Lumen can generate an image of "yourself" using her persistent appearance

A separate assistant-services/My Day feature line has also implemented and
validated tasks, reminders, notes, checklists, projects/goals, action cards,
Undo, source-linked search, and reminder behavior. That work must be treated as
feature-branch work pending integration until it is merged into this branch.

## Product model

The current product direction separates five primary concepts.

### Conversation

The place where the user and Lumen interact.

Conversation owns the immediate interaction experience: text, voice, media,
activity state, generated responses, and contextual actions.

### Companion

The place for Lumen herself.

Companion state includes identity and configuration such as:

- name
- gender/presentation
- personality and inner-state configuration
- portrait
- persistent visual identity
- voice
- companion-specific conversation model
- other stable companion preferences

Companion state is not ordinary conversational memory.

### Memories

Information Lumen has remembered from conversation or that the user explicitly
saved.

Memories remain evidence-linked and account/companion scoped. They should not
silently become identity/configuration state.

### Gallery

The home for generated and saved visual media.

Gallery is intended to grow beyond inline chat images into image history,
reference assets, variations, and eventually video.

### Settings

Application-level configuration such as appearance, themes, connections,
accounts, infrastructure preferences, and other controls that are not part of
Lumen's personal identity.

## Current local architecture

Lumen currently spans three primary machines.

### aiLumen-llm-video

Application/orchestration node.

Current responsibilities include:

- Expo web frontend
- FastAPI backend
- local Supabase
- authentication
- conversations and memory orchestration
- generated-media persistence
- image-provider orchestration
- Lumen system services

### aiLumen-llm-heavy

High-capability GPU inference node.

Current hardware includes:

- Ryzen 7 7700X
- 32 GB DDR5
- NVIDIA GeForce RTX 5060 Ti 16 GB

Current services include Ollama, Open WebUI, and ComfyUI.

ComfyUI currently supplies Lumen's image-generation capability using
FLUX.2 Klein 4B FP8.

### aiLumen-llm-tts-stt / Helios

Speech and backup node.

Current responsibilities include:

- speech-to-text
- text-to-speech
- Speaches
- Lumen backup destination

Helios currently uses an NVIDIA GeForce GTX 1660 Ti.

## Architectural direction

Physical machines should not permanently define capabilities.

Lumen is moving toward capability-based provider routing using concepts such as:

- `llm`
- `vision`
- `image`
- `video`
- `tts`
- `stt`

A machine may provide several capabilities. Provider selection should eventually
consider model availability, health, GPU requirements, latency, load, and user
preferences.

The frontend should request a capability without needing to know which machine
performs it.

## Persistent identity

Lumen's identity belongs to application state, not to whichever model happens
to answer a request.

This distinction is fundamental.

Conversation models may be changed without replacing Lumen's:

- account relationship
- companion record
- memories
- visual identity
- voice
- media
- history
- future assistant state

The same principle applies to visual identity. Lumen's appearance is stored as
companion state and is resolved by companion UUID rather than by display name.

## Visual identity

The current image system can recognize explicit companion-self requests such as
"yourself", "of you", "with you", or the companion's name.

When Lumen is the subject, the backend composes her persistent
`visual_identity` into the provider prompt while preserving:

- the original user prompt
- the resolved provider prompt
- the resolved image subject
- the provider used

Textual identity already produces a recognizable visual direction.

The next image milestone is reference-image conditioning for stronger facial
consistency across seeds, scenes, clothing, expressions, and camera angles.

Reference conditioning should be evaluated before training a LoRA.

## Product design direction

The current Take 2 design direction emphasizes Lumen as a companion rather than
a dashboard.

Current visual direction:

- black / charcoal foundation
- gold accents
- silver/metallic supporting elements
- warm premium presentation
- customizable themes/colors
- customizable portrait framing

Conversation should keep Lumen visually present without sacrificing message
readability. The intended design includes a small companion portrait beside
Lumen's replies that scrolls naturally with conversation rather than remaining
as a distracting fixed decoration.

The star logo is being retired.

Future expression/activity work should allow Lumen's presentation to respond
subtly to states such as listening, thinking, speaking, remembering, generating
media, or completing an action. More fluid expression can follow after the
interaction architecture is stable.

## Everyday-assistant direction

The next major product layer turns conversation into useful follow-through.

Target experiences include:

- "What was that movie Sarah recommended?"
- "Remind me to call the mechanic tomorrow."
- "What's on my plate?"
- shopping lists
- gift ideas
- project notes
- checklists
- goals
- questions to remember for appointments
- follow-ups
- things the user said they intended to do
- searchable personal information

The goal is for useful information and intentions to stop disappearing into
chat history.

Actions should remain inspectable, reversible where appropriate, and clearly
distinguished from ordinary conversation.

## Documentation map

Start here, then use the specialized documents for detail:

- `ROADMAP.md` — master implementation roadmap and status
- `docs/architecture.md` — machines, providers, state boundaries, and data flow
- `docs/product-design.md` — Take 2 UI/product architecture
- `docs/assistant-services.md` — everyday assistant and My Day architecture
- `docs/image-generation.md` — local image generation and visual identity
- `docs/chat-and-natural-memory.md` — streaming chat and natural memory
- `docs/documents.md` — private PDF/text imports, search, and page references
- `docs/document-actions.md` — reviewed document checklists, notes and follow-up reminders
- `docs/goals-and-practice.md` — goal setup, Spanish practice sessions and saved progress
- `docs/web-research.md` — public web excerpts and cited answers
- `docs/model-picker.md` — companion conversation-model selection
- `docs/social-login.md` — local Supabase social authentication
- `ACCOUNTS.md` — account ownership and isolation
- `BACKUPS.md` — backup and recovery operations
- `NATURAL_MEMORY.md` — natural-memory design and research history

## Core principles

As Lumen grows, preserve these boundaries:

1. Persistent identity is separate from replaceable inference models.
2. Companion state is separate from conversational memory.
3. Account identity comes from authentication, never from names.
4. Private user state remains owner scoped.
5. Model claims do not prove that an action or persistence succeeded.
6. Generated-media provenance remains inspectable.
7. The frontend should not need to know physical provider topology.
8. Proactive behavior must remain understandable and controllable.
9. User data and companion reference assets remain private by default.
10. New intelligence should make Lumen more useful without making her state
    less trustworthy.

See `ROADMAP.md` for what is implemented, what is awaiting integration, and
what comes next.

## October 8: everyday capture

Explicit chat commands now append to named open lists, save gift ideas and capture
quick notes in My Day. Saved cards expose the captured text and link to editing.
Owner-scoped atomic appends retain retry receipts and reject ambiguous list names.
Local verification: 198 backend tests, typecheck, clean web export and capture SQL
checks. The user reported the corrected capture flow working on October 8 at `6e1260e`. See `docs/everyday-capture.md`.

Capture host testing found missed greeting, period and smart-quote forms despite
working eggs capture/list read. These inputs now have regression coverage. The
fix also guards generated list/note save claims and replaces unrelated-memory
fallbacks with a no-save reply. Local checks: 200 backend tests, typecheck and
clean web export. The user reported the fix working on October 8 at `6e1260e`; no new migration.
