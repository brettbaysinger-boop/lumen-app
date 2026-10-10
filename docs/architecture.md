# Lumen Architecture

This document describes the current technical architecture and the boundaries
that should remain stable as Lumen grows.

## Architectural goal

Lumen is a persistent local-first companion whose identity and trusted state
survive changes in models, providers, GPUs, and physical machines.

Models provide capabilities.

They do not define who Lumen is.

## Current topology

### aiLumen-llm-video

Primary application and orchestration node.

Responsibilities:

- Expo web application
- FastAPI backend
- local Supabase stack
- Supabase Auth
- conversation orchestration
- memory orchestration
- assistant-action orchestration
- generated-media persistence
- provider routing
- systemd services
- primary development checkout

Current application services include:

- Lumen API
- Lumen web frontend
- local Supabase

### aiLumen-llm-heavy

Primary high-capability GPU node.

Hardware:

- Ryzen 7 7700X
- 32 GB DDR5
- NVIDIA GeForce RTX 5060 Ti 16 GB

Current inference/runtime services:

- Ollama
- Open WebUI
- ComfyUI

Current Lumen use:

- larger local language-model workloads
- local image generation

Current image model:

`FLUX.2 Klein 4B FP8`

Heavy should not be modeled as "the image machine". It is a compute node that
can expose multiple capabilities.

### aiLumen-llm-tts-stt / Helios

Speech and backup node.

Current responsibilities:

- speech-to-text
- text-to-speech
- Speaches
- backup destination

Current GPU:

- NVIDIA GeForce GTX 1660 Ti

## Capability model

The long-term architecture should register capabilities independently from
physical machine names.

Initial capability vocabulary:

- `llm`
- `vision`
- `image`
- `video`
- `tts`
- `stt`

A provider/node can advertise several capabilities.

Future routing may consider:

- provider health
- installed models
- model compatibility
- available VRAM
- current load
- latency
- preferred/default provider
- privacy/locality constraints
- request-specific quality requirements

The frontend should not contain private provider IP addresses or need to know
which machine fulfills a request.

## Trusted state

Lumen has several kinds of persistent state.

They should remain conceptually distinct.

### Account state

Examples:

- authenticated user identity
- profile
- connected authentication identities

Authoritative identity comes from Supabase Auth UUIDs.

Never infer account ownership from display names.

### Companion state

Examples:

- companion UUID
- name
- personality/configuration
- selected conversation model
- automatic-memory setting
- portrait
- visual identity
- voice configuration
- future self-model state

This state describes the companion.

It is not ordinary conversational memory.

### Conversational memory

Examples:

- reported user preferences
- facts explicitly saved by the user
- facts noticed in conversation
- approved/reviewed observations

Memory carries ownership, subject semantics, and source evidence.

### Conversation state

Examples:

- conversations
- user messages
- assistant messages
- message metadata
- generation provenance

### Assistant/action state

Examples:

- tasks
- reminders
- notes
- checklists
- projects
- goals
- source links
- action status

This is structured actionable state rather than merely a remembered fact.

### Media state

Examples:

- generated chat images
- future generated videos
- companion reference assets
- future user reference assets
- media metadata

Private media should remain owner scoped.

## Authentication and authorization

Supabase Auth provides verified account identity.

Application tables use row-level security.

The backend validates the access token and performs application operations
within the signed-in user's ownership boundary.

Companions are owned through `owner_user_id`.

Conversation IDs must belong to the requested owned companion.

Anonymous or cross-account requests must not gain access to private state.

The health endpoint can remain public because it does not expose private
account data.

## Chat flow

Current conceptual flow:

1. Frontend submits an authenticated user message.
2. Backend validates authentication.
3. Backend validates companion/conversation ownership.
4. Backend loads relevant companion state.
5. Backend loads conversation context and applicable memories.
6. Backend selects the companion's configured conversation model.
7. Ollama performs inference.
8. Web clients receive streamed response events.
9. Authoritative messages are persisted.
10. Natural-memory observation may run after the foreground reply.

Foreground conversation should remain more important than background
extraction work.

## Memory flow

Natural-memory extraction is a secondary interpretation of conversation.

The extractor can identify possible durable facts, but model output alone is
not authoritative.

The system applies deterministic checks and database ownership rules.

Depending on confidence/conflict/settings, a candidate may:

- save automatically
- enter review
- be rejected
- be suppressed as a duplicate

Persisted state, not the model's wording, determines whether something was
actually remembered.

## Voice flow

Current browser flow:

### Speech to text

browser microphone
→ authenticated Lumen backend
→ Helios / Speaches
→ transcription
→ frontend draft

The user can review the transcription before sending.

### Text to speech

assistant message
→ authenticated Lumen backend
→ Helios / Speaches
→ synthesized audio
→ browser playback

Raw recordings are not conversational memories.

Voice selection should ultimately be companion configuration while provider
location remains infrastructure configuration.

## Image-generation flow

Current flow:

user image request
→ frontend image intent
→ authenticated backend
→ companion/conversation validation
→ subject resolution
→ visual-identity prompt composition when appropriate
→ ComfyUI provider on Heavy
→ FLUX.2 Klein workflow
→ generated PNG
→ private Supabase Storage
→ persisted message metadata
→ frontend rendering

The current known-good workflow is versioned at:

`backend/workflows/flux2-klein-4b-fp8.json`

## Image prompt provenance

The backend preserves:

- original user prompt
- resolved provider prompt
- resolved image subject
- image provider

The original user message must not be silently replaced with an internal
provider prompt.

## Companion visual identity

`companions.visual_identity` is persistent companion state.

When the user explicitly asks for Lumen as the subject, the backend can resolve
that request and incorporate her stable appearance.

This state is scoped by companion UUID.

Do not resolve visual identity merely from a display name.

The existing UI `portrait_url` and canonical generation references are
different concepts. They may later be connected deliberately, but should not
be conflated by accident.

## Storage

Current generated chat images use the private Supabase Storage bucket:

`chat-media`

Current database/Auth backups do not by themselves guarantee recovery of all
Storage objects.

Storage backup is therefore a roadmap item.

Future canonical companion/user reference assets must also have a tested
private backup strategy.

## Assistant/action architecture

The My Day work introduces structured state for useful follow-through.

Conceptually:

conversation
→ intent/action recognition
→ explicit structured mutation
→ persisted action object
→ visible action result/card
→ optional reminder/scheduling
→ later retrieval/My Day

Important principles:

- actions are distinguishable from ordinary conversation
- mutations are inspectable
- source context is retained where useful
- Undo is available where practical
- account/companion ownership remains enforced
- a model claiming an action occurred is not proof that it occurred

## UI/application boundary

The UI should communicate user intent and render authoritative results.

It should not become the source of truth for:

- account ownership
- companion identity
- memory persistence
- action completion
- provider routing
- visual-identity resolution

Those belong to backend/application state.

## Provider registry direction

The current implementation contains individual provider seams such as the
configured ComfyUI endpoint.

The next architecture should generalize this.

Possible conceptual provider record:

- provider ID
- node ID
- endpoint
- capabilities
- installed models
- health
- priority
- resource metadata
- enabled/disabled state

Requests can then be routed by capability instead of hostname.

This is particularly important because Heavy can perform both cognitive and
image workloads.

## Reliability boundaries

Preserve these rules:

- persistence success comes from the database/service result
- authentication identity comes from Auth
- ownership comes from UUID relationships and RLS
- provider output is untrusted until the request succeeds
- failed media generation must not create false completed state
- retries should avoid duplicate mutations
- background jobs should eventually become durable
- private provider topology should not leak into frontend design

## Current verification checkpoint

At commit:

`6ccfcbc Add persistent companion visual identity`

the integrated branch has:

- 66 passing backend tests
- passing TypeScript validation
- live authenticated image generation
- verified private image persistence
- verified persistent companion-self image generation

A separate assistant-services feature line has additional My Day/action work
that must be integrated and revalidated before it becomes part of this
checkpoint.

## Architecture north star

The user should experience one coherent Lumen.

Internally, Lumen may use several:

- models
- GPUs
- providers
- machines
- databases/services
- media pipelines

Those implementation details should increase capability without fragmenting
the companion's identity.

## October 10 — Provider visibility

Configured provider routes and persisted foreground request details are implemented
and locally verified (259 backend tests, typecheck, clean web export and mocked
mobile browser checks). Direct-image reply wording is also refined. Deployment and
new-feature user acceptance remain pending. Prior companion-image prose and Gallery
behavior were user-verified at `0cde482`. Routing and Helios remain unchanged.
See [provider-visibility.md](provider-visibility.md) for scope, hardware evidence and acceptance checks.

## Live acceptance and subject correction — October 9, Phoenix

Provider visibility at `db21282` is now deployed and user-verified, superseding
the preceding pending-acceptance note. A follow-up fixes companion-name greetings
being mistaken for portrait subjects. The subject fix passed 25 targeted backend
tests; its deployment and live acceptance remain pending. Full evidence and
limits: `docs/provider-acceptance-checkpoint.md` (repository-relative path).
