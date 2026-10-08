# Lumen Roadmap

This document is the master implementation map for Lumen.

It combines the technical, companion, multimodal, UI, and everyday-assistant
work developed across the Lumen project conversations.

Statuses are deliberately explicit:

- **Integrated** — present on the active integration branch.
- **Feature branch** — implemented/validated elsewhere but not yet integrated.
- **Next** — near-term planned work.
- **Future** — planned after the current foundation.
- **Research** — exploratory and requires evaluation before product adoption.

Active integration branch:

`feat/lumen-integration`

Historical integration checkpoint:

`e5f0197 Unify Lumen project documentation and roadmap`

Current deployed development branch: `feat/lumen-take2-local`. The October 7
checkpoint includes authenticated HTTPS mobile access, voice/camera/photo
understanding, web research, private PDF/text imports, and reviewed document
actions. See `docs/assistant/STATUS.md` and `docs/assistant/VALIDATION.md` for
reported host verification versus local automated checks.

---

## 1. Local companion foundation — Integrated

Implemented:

- local-first FastAPI backend
- Expo frontend
- local Supabase
- local Supabase Auth
- persistent conversations
- Ollama-backed local cognition
- systemd services
- browser session persistence
- account-scoped companions
- row-level security
- cross-account isolation
- companion-specific model selection
- social-login provider support

The companion's persistent state belongs to the application rather than a
specific inference model.

---

## 2. Conversation — Integrated

Implemented:

- authenticated chat
- persisted user and assistant turns
- immediate submitted-message display
- authenticated web reply streaming
- activity/timing stages
- foreground inference priority
- selected-model persistence
- corrective guards around unsupported memory-save claims

Continue improving:

- richer multimodal message rendering
- provider/model provenance
- graceful provider failure
- better action/result presentation
- native streaming strategy

---

## 3. Memory — Integrated, continuing

Implemented:

- explicit memory commands
- user / companion / shared / unknown subjects
- subject-user and reporting-user ownership
- natural conversation observation
- evidence-linked extraction
- proposal review
- conservative automatic remembering
- conflict/review behavior
- companion automatic-memory toggle
- correction
- deletion
- Undo
- retry of unfinished observations

Next:

- semantic retrieval
- stronger relevance ranking
- temporal retrieval
- conflict/change detection
- correction history
- durable retry workers
- better ambiguous-reference resolution

Research:

- evidence-linked reflection
- tentative summaries separate from facts
- measured retrieval improvements
- accurate companion self-model

Do not equate convincing conversational behavior with evidence of subjective
experience.

---

## 4. Voice — Integrated

Implemented:

- browser microphone capture
- authenticated STT through Helios
- transcription into the conversation draft
- TTS through Helios
- manual assistant-reply playback

Next:

- companion-level voice selection UI
- voice as part of Companion configuration
- native-device validation
- improved speech lifecycle
- optional natural conversational voice mode

Voice identity belongs to the companion; infrastructure/provider details belong
to the application/provider layer.

---

## 5. Local image generation — Integrated

Implemented:

- natural image-request routing
- backend image-provider seam
- ComfyUI on Heavy
- FLUX.2 Klein 4B FP8
- known-good versioned workflow
- prompt substitution
- randomized seeds
- PNG retrieval
- private `chat-media` storage
- authenticated inline conversation rendering
- provider provenance

Integrated checkpoint:

`9020e82 Complete local image generation workflow`

---

## 6. Persistent companion visual identity — Integrated

Implemented:

- `companions.visual_identity`
- companion-scoped physical appearance
- explicit companion-self subject resolution
- "yourself"
- "of you"
- "with you"
- companion-name recognition
- preservation of original user prompt
- preservation of resolved provider prompt
- image subject provenance
- live end-to-end self-image verification

Integrated checkpoint:

`6ccfcbc Add persistent companion visual identity`

Current validation:

- 66 backend tests passing
- TypeScript validation passing
- live self-image generation verified

The current textual identity provides semantic consistency but not exact facial
identity.

---

## 7. Reference-conditioned identity — Next

Add private canonical companion reference assets.

Evaluate reference-conditioned generation before training a LoRA.

Success criteria:

- recognizable same face across seeds
- stable eye/hair/complexion traits
- clothing can change
- pose can change
- expression can change
- environment can change
- camera angle can change
- reference pose is not overfit

Potential later stages:

- multiple canonical references
- identity embeddings/adapters
- consistency evaluation
- LoRA only if simpler conditioning is insufficient

---

## 8. User visual identity and multi-subject scenes — Future

Lumen currently has companion visual identity but not a canonical user visual
identity.

Future work:

- private user reference assets
- user textual visual identity
- explicit multi-subject representation
- independent user/companion prompt composition
- "you and me" scenes
- privacy controls

Never silently invent a persistent user appearance.

---

## 9. Take 2 product architecture — Next / active design

Primary product areas:

### Conversation

Interaction with Lumen.

Includes:

- messages
- voice
- generated media
- camera/media inputs
- contextual actions
- activity state

### Companion

Lumen herself.

Includes:

- name
- gender/presentation
- portrait
- visual identity
- personality/inner state
- voice
- conversation model
- stable companion preferences

### Memories

Remembered information.

Includes:

- facts
- source evidence
- ownership/subject
- corrections
- review
- search/retrieval

### Gallery

Visual/media history.

Includes:

- generated images
- future generated video
- image history
- reference assets
- variations
- media inspection

### Settings

Application configuration.

Includes:

- account
- themes/colors
- connections
- provider/infrastructure settings
- privacy
- application behavior

This conceptual split should remain stable even if navigation/layout changes.

---

## 10. Take 2 visual direction — Next / active design

Current direction:

- black
- charcoal
- gold
- silver/metallic support
- premium/warm presentation
- customizable themes and colors
- customizable portrait frames

Conversation:

- small Lumen portrait beside assistant replies
- portrait scrolls naturally with messages
- readability remains primary
- avoid oversized fixed character decoration

Branding:

- retire the star logo
- let Lumen's portrait/identity carry more of the product personality

Future expression system:

- idle
- listening
- thinking
- speaking
- remembering
- creating
- action completed
- subtle emotional/expression variation

Start with restrained state changes; add fluid expression only after the UI
architecture is stable.

---

## 11. My Day / assistant action foundation — Feature branch

A separate assistant-services feature line has implemented and validated an
initial structured action system.

Implemented there:

- tasks
- reminders
- notes
- checklists
- projects/goals
- conversational action cards
- Undo
- source-linked search
- reminder behavior

That work must not be described as integrated into `feat/lumen-integration`
until merged.

Reported feature-branch validation includes:

- 88 backend tests
- database checks
- desktop browser checks
- mobile browser checks

Integration should preserve existing companion ownership, memory semantics,
and authentication boundaries.

---

## 12. Everyday assistant services — Next

The target is useful follow-through rather than a collection of disconnected
productivity screens.

### Remember what matters

Example:

"What was that movie Sarah recommended?"

Lumen should retrieve relevant remembered/source-linked information naturally.

### Turn conversation into action

Example:

"I need to call the mechanic tomorrow."

Lumen should be able to offer/create an appropriate reminder or task rather
than allowing the intention to disappear into chat.

### Help plan the day

Example:

"What's on my plate?"

Provide a concise synthesis of:

- appointments
- tasks
- reminders
- follow-ups
- commitments
- relevant project items

### Capture everyday things

Examples:

- shopping lists
- gift ideas
- project notes
- questions for a doctor
- packing lists
- things to research
- recommendations from friends

### Help when the user is stuck

Use available context to help break work into useful next actions without
taking control away from the user.

### Search personal information

Allow natural retrieval across:

- memories
- notes
- tasks
- projects
- conversations
- eventually connected services

Results should retain source/provenance where possible.

### Proactive assistance

Proactivity should be controlled and explainable.

Good examples:

- surface a reminder when due
- mention an unresolved commitment
- offer to capture an obvious task
- surface relevant context for an upcoming event

Avoid constant unsolicited interruption.

### Reversible actions

Where practical:

- show what changed
- provide Undo
- preserve source links
- distinguish proposed actions from completed actions

---

## 13. Capability-based provider registry — Next

Replace single-endpoint assumptions with provider/node registration.

Capability vocabulary:

- `llm`
- `vision`
- `image`
- `video`
- `tts`
- `stt`

Routing factors should eventually include:

- capability
- installed model
- provider health
- VRAM/resource requirements
- latency
- current load
- preferred provider
- privacy/locality requirements

Heavy can provide multiple capabilities; its role must not be artificially
limited to a single modality.

The frontend should not know which physical machine fulfills a capability.

---

## 14. Gallery and image evolution — Future

After identity consistency:

- image history
- gallery browsing
- regenerate
- variations
- reference-image selection
- aspect ratio controls
- quality/model controls
- image editing
- richer composition
- multiple image providers
- media metadata inspection

Keep generated media private by default.

---

## 15. Local video generation — Future

Add video behind the same provider/capability architecture.

Target flow:

natural conversation request
→ authenticated backend
→ provider routing
→ local video generation
→ private media persistence
→ conversation/gallery rendering

Do not permanently bind video generation to a machine merely because it is
currently named `aiLumen-llm-video`.

---

## 16. Multimodal understanding — Photo checkpoint implemented

Owner-scoped uploaded photos and camera captures now reach the selected Ollama
conversation model when it reports vision support. The model picker shows support
status; photo drafts offer Describe, Read text, Explain, and Meal ideas. See
`docs/vision.md` for limits and verification. Live camera access on remote browsers
requires HTTPS.

Private PDF/TXT/Markdown import, lexical retrieval, and cited page references are
implemented on the Take 2 feature line; see `docs/documents.md`. Original files
are not retained. Mobile Tailscale PDF/photo understanding was verified at
`ea6a562` and tagged `lumen-take2-mobile-documents-20261006`.

Reviewed document-to-checklist/note/follow-up drafts are now implemented on the
feature line, with source pages, explicit Save, reminder time selection, and
Undo/Restore. See `docs/document-actions.md`. Local checks passed (174 backend tests, SQL ownership/retry tests and mobile-sized
browser tests). On October 7, the user verified checklist generation, note
review/edit/save to My Day, and a saved follow-up reminder. The note shortcut now
uses the verified short three-detail request; broader model/document reliability
remains ongoing work.

Further multimodal work includes:

- automatic reuse of earlier uploaded or generated images
- OCR and richer document layout
- audio
- video

Vision should participate in the same authenticated companion context as text.

Camera/media controls belong naturally in Conversation.

---

## 17. Connections and external services — Future

External integrations may eventually provide:

- calendar
- email
- contacts
- files
- task systems
- other user-approved services

Principles:

- explicit permission
- clear ownership
- least privilege
- visible source
- reversible actions where possible
- no silent expansion of access

Connections belong primarily in Settings, while their useful results appear
naturally in Conversation/My Day.

---

## 18. Companion self-model — Future / Research

Develop persistent state describing what Lumen actually knows about herself.

Possible areas:

- identity
- configured capabilities
- current provider availability
- established companion preferences
- uncertainty
- limitations
- current interaction/activity state

Self-reporting should be grounded in real state rather than invented
capabilities or experiences.

---

## 19. Reliability and observability — Continuing

Before Lumen can be considered production-ready:

- provider health registry
- graceful failover
- durable background jobs
- request idempotency
- structured provider timings
- action provenance
- media cleanup policy
- storage backup
- reference-asset backup
- recovery drills
- multimodal regression tests
- operational visibility

Model/provider failures should degrade gracefully without corrupting persistent
state.

---

## 20. Backup expansion — Next

Current backup coverage protects database/Auth state but does not protect all
multimodal assets.

Add/test protection for:

- Supabase Storage
- generated chat media
- companion reference images
- user reference images if enabled
- critical ComfyUI workflows
- provider configuration required for rebuilds

Large downloadable model weights may remain reproducible runtime assets, but
record exact model versions and preferably checksums.

---

## 21. Native/mobile hardening — Future

The browser remains the most mature client.

Future work:

- native auth/session verification
- native voice validation
- native streaming
- media upload
- image generation
- gallery
- deep-link/social-auth validation
- remote/Tailscale deployment ergonomics

---

## 22. Learned personalization — Research

Only after state, provenance, consent, and evaluation are strong:

- identity adapters
- LoRA where reference conditioning is insufficient
- learned personalization from explicitly consented data
- adaptive provider/model selection
- richer reflection/planning

Every training experiment should have:

- a defined dataset
- explicit consent
- a measurable objective
- before/after evaluation
- a reversible deployment path

---

# Near-term build order

The current intended sequence is:

1. Finish and integrate the Take 2 product/UI architecture.
2. Integrate the My Day / assistant-action foundation cleanly.
3. Add Companion UI for visual identity and Helios voice selection.
4. Add reference-conditioned Lumen identity.
5. Build the Gallery around existing generated media.
6. Introduce capability/provider registration.
7. Expand everyday assistant services and My Day.
8. Improve semantic retrieval and source-linked personal search.
9. Add multimodal vision/document input.
10. Add local video generation after the provider architecture is ready.

This ordering can change when implementation reveals dependencies, but the
architectural boundaries should remain stable.

# Product north star

Lumen should feel personal, helpful, engaging, and trustworthy.

The system should increasingly be able to:

- remember what matters
- understand context
- find things again
- turn conversation into action
- help plan the day
- capture everyday information
- work across modalities
- maintain a stable companion identity
- use local hardware intelligently
- preserve user control and privacy

The repo, not any individual chat session, should remain the authoritative
record of what is implemented and what comes next.

## October 7 evening checkpoint — ongoing goals

On October 7, the user verified the direct-JSON note fix at `63e3e62`, reported a major speed improvement, and pushed the branch and `lumen-take2-note-json-20261007` tag. The speed gain is user-reported, not a measured benchmark.

Workstream #8 now has Goals & practice: level/focus/time/rhythm preferences,
atomic session/chat creation, resume, explicit progress/corrections/vocabulary and
next-step notes, and bounded continuity into a new session. Local backend, SQL
and mobile-sized browser checks cover persistence and ownership. The user verified
the original flow at `946b017` and reported the chat-save increment working at `1006343`. See `docs/goals-and-practice.md`. Recurring notifications,
multilingual speech evaluation, milestones and full-course semantic recall remain
future work.

## October 7: practice chat saves

On October 7, the user verified goal setup, practice, progress saving and continuity at `946b017`. After deploying `1006343`, the user reported that everything was working well, confirming the practice chat-save checkpoint. This is user-reported deployment verification; automated coverage is recorded separately.

Explicit save-session requests now summarize the bounded practice transcript and
finish the owned session, with a persisted chat receipt only after the write is
confirmed. Repeated saves reuse the record. Completed notes can be edited in
Goals & practice. Summarization failure uses labeled excerpts; failed writes do
not report success. Session notes remain separate from long-term memories.
See `docs/goals-and-practice.md`.

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
