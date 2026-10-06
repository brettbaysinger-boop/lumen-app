# Chat responsiveness and natural memory

Web chat now shows the submitted question immediately, streams reply text over an authenticated NDJSON POST, and displays actual activity stages. Enter sends; Shift+Enter inserts a newline. IME composition and duplicate key events are guarded. Native chat shows progress and uses the existing complete-response API; native token streaming is not claimed or tested.

Activity details show Ollama load, prompt-evaluation and generation timings. These are operational measurements, not a hidden thought transcript. Model reasoning fields are not collected or displayed. A reply that falsely claims a memory write is discarded and corrected; provisional streamed text can be replaced by the authoritative saved reply.

Lumen requests explicitly set an 8,192-token context and 15-minute residency by default (`CHAT_CONTEXT_LENGTH`, `OLLAMA_KEEP_ALIVE`). Open WebUI retains its own request settings and can still cause reallocation or GPU contention. This change does not guarantee full GPU offload; verify with `ollama ps` after a Lumen reply. Persisted message metadata and API logs contain timings, without user statement text.

Memory extraction follows the selected companion chat model unless `MEMORY_OBSERVATION_MODEL` explicitly overrides it. One API process serializes inference and interrupts background extraction when a new foreground turn arrives. Interrupted checks are marked failed and can be retried from Memories; there is no durable autonomous retry daemon in this version. Run a single API worker for this scheduling behavior; multiple workers or external Ollama clients are not coordinated by this lock.

Automatic remembering defaults on per companion. The extractor must classify the candidate as an explicit, non-sensitive, non-conflicting user fact with a stable topic. Exact evidence must occur in the original user statement. Additional deterministic checks reject questions, hypothetical language, unclear ownership, and common sensitive categories. Missing classification fields fail closed into review. Existing memories are supplied for conflict detection; an oversized history forces review. Classification is model-based and can make mistakes; the UI therefore exposes the saved fact, Undo, correction, deletion and an automatic-memory toggle.

The owner-scoped SQL save function checks the toggle at write time, serializes saves by companion, and leaves conflicting established topic values in review. Existing deleted/dismissed exact facts remain suppressed. Facts aren't silently replaced. All existing memories remain intact. The UI polls successful database writes for save notices, and offers confirmation for new pending proposals in chat; users can edit wording/ownership in Memories before approval. Older pending suggestions are not retroactively auto-approved.

Apply `20261005020000_automatic_memory.sql` with local `supabase db push --local`; never reset the database. Rebuild web and restart API/web after import. If the desktop explicitly configured a separate extraction model, clear that override to opt into same-model extraction. No new package dependencies.

Verification: backend streaming/auth/error/scheduling and memory-classification tests; real SQL migrations, owner isolation, toggle/conflict/idempotence and full backup restore; TypeScript; keyboard utility and voice checks; Expo web export. Browser end-to-end validation could not run because Chromium downloads failed in the execution environment. GPU timings, UI streaming, notices and model fit still require desktop verification.

Desktop acceptance: hard refresh; Enter a direct preference; see immediate question, activity, then incremental reply; Shift+Enter inserts a line. Confirm one reply per submission. Wait for a database-backed memory notice, inspect it in Memories, Undo it, and confirm it stays inactive. Disable automatic remembering in Settings and submit a different fact: it must stay a proposal. Sensitive or changed facts should ask for review, not overwrite existing records. Confirm the chat model in `ollama ps`; compare its context/offload with Open WebUI closed and after an Open WebUI request.

<!-- LUMEN-CURRENT-STATE-2026-10 -->
## Current integration context — October 2026

The chat and natural-memory behavior documented above remains part of the
current integrated Lumen foundation.

Newer capabilities now share the same authenticated Conversation surface.

### Conversation now includes more than text

The current integrated conversation can include:

- streamed text replies
- voice transcription
- assistant speech playback
- generated images
- generated-image metadata/provenance

Future Conversation work will add structured assistant actions and richer
multimodal inputs.

### Image requests

Natural image requests are detected by the frontend and sent through an
authenticated backend image route.

The backend, not the frontend, resolves companion-self identity because the
backend has authoritative companion context.

When Lumen is explicitly the image subject, the backend can compose
`companions.visual_identity` into the provider prompt.

This identity state is not injected through conversational memory.

### Assistant actions

The separate My Day feature line introduces structured actions such as tasks,
reminders, notes, checklists, and projects/goals.

When integrated, action persistence should remain distinct from memory
observation.

A model saying that it remembered, scheduled, or created something is never
authoritative by itself.

### UI direction

Take 2 treats Conversation as the interaction surface rather than a general
configuration screen.

Conversation should increasingly support:

- companion portrait presence
- subtle observable activity state
- contextual action cards
- media
- camera/file input
- useful follow-up actions

Stable companion identity/configuration belongs in Companion.

Application configuration belongs in Settings.

See:

- `docs/product-design.md`
- `docs/assistant-services.md`
- `docs/image-generation.md`
