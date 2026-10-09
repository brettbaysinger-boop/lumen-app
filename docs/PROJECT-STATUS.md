# Lumen — Authoritative Project Status

**Checkpoint:** October 8, 2026
**Development branch:** `feat/lumen-take2-local`
**Last user-verified feature deployment:** `eb7cea4`
**Previous documentation checkpoint:** `1ea6142`

This document is the canonical summary of Lumen's current development
position. Detailed feature documentation, architecture decisions, and
validation history remain in their respective files.

## Project direction

Lumen is a local-first, privacy-conscious AI companion designed to
remember useful context, assist with everyday life, support ongoing
goals, understand documents and images, and use local AI infrastructure.

The repository is authoritative for implementation status. Chat
history is not a substitute for checking the current code and records.

## Infrastructure

| Node | Responsibility |
| --- | --- |
| `aiLumen-llm-video` | Application, backend, database, orchestration |
| `aiLumen-llm-tts-stt` | Helios speech recognition and synthesis |
| `aiLumen-llm-heavy` | RTX 5060 Ti 16GB GPU compute node |

Heavy is documented as an image-generation provider through ComfyUI.
Its current runtime utilization and broader inference capabilities
have not yet been audited.

## Implemented foundations

### Companion experience

- Take 2 interface and appearance customization.
- Companion name, persona, portrait, and visual identity editing.
- Companion-specific Helios voice selection and preview.
- Animated companion presence and speech-state effects.
- Persistent conversations and companion state.

### Everyday assistant

- My Day items, reminders, notes, and checklists.
- Conversational capture into named lists.
- Gift ideas and quick notes.
- Reviewed small-step plans with persistent completion.
- Goals, practice sessions, and explicit progress saving.

### Research and understanding

- Local SearXNG-backed web research with cited excerpts.
- Private PDF/TXT/Markdown document imports and search.
- Document questions with source/page references.
- Reviewed document-to-checklist, note, and reminder drafts.
- Local photo understanding using a vision-capable Ollama model.
- Existing ComfyUI image-generation provider integration.

## Verification and evidence

- October 6: user-reported mobile HTTPS login, camera,
  microphone, photo understanding, and document attachment checks.
- October 7: user-reported document action and practice-flow checks.
- October 8: user-reported everyday capture and small-step plan checks.
- October 8: user reported daily use of shopping lists and reminders.
- Latest documented automated checkpoint: 207 backend tests,
  TypeScript check, clean web export, SQL privacy/persistence checks,
  and mobile-sized mocked browser verification.

User reports, automated checks, implementation inspection, and
unverified runtime behavior must remain clearly distinguished.

## Known limitations

- Closed-app push and recurring reminder notifications remain future work.
- Document and memory retrieval are primarily lexical, not semantic.
- Scanned PDF OCR and richer document layout extraction remain future work.
- Companion portrait generation-to-selection flow needs verification.
- Heavy's active GPU workloads, available VRAM, model inventory,
  and inference routing need direct runtime inspection.
- Existing image generation does not establish that Heavy is
  currently serving conversation or vision inference.
- Provider/capability registry remains a planned architectural increment.

## Current priority

**Improve utilization of `aiLumen-llm-heavy` without duplicating
already implemented Companion UI, voice, vision, or research features.**

Next steps:

1. Inspect Heavy's actual GPU services, models, memory, and utilization.
2. Inspect backend Ollama and ComfyUI routing and deployed endpoints.
3. Identify one safe, measurable GPU workload improvement.
4. Validate behavior, responsiveness, and VRAM contention.
5. Verify companion portrait generation and saved-portrait integration.
6. Update this checkpoint after each completed workstream.

## October 9, 2026 — Image generation and gallery recovery

**State:** Database recovery applied and verified. Application changes tested
locally but not yet committed, deployed, or user-verified in the browser.

### Confirmed infrastructure

- `aiLumen-llm-heavy` serves ComfyUI at `192.168.86.50:8188`.
- Heavy reports an NVIDIA RTX 5060 Ti with 16 GB VRAM.
- Required FLUX.2 Klein 4B FP8 model assets and workflow nodes are available.
- A live backend-provider generation returned a valid 1024×1024 PNG
  in approximately 3.04 seconds.
- The application backend is configured to use Heavy for image generation.
- This does not establish that Heavy serves conversational or vision inference.

### Image and gallery repairs

- Expanded direct image-request detection.
- Added contextual handling for confirmations of explicit image offers.
- Preserved the user's literal confirmation separately from the resolved
  image-generation prompt.
- Added gallery registration for generated images and user-uploaded images.
- Added authenticated signed-URL rendering for private gallery images.
- Added signed-URL renewal for longer-lived gallery sessions.
- Gallery registration failures are logged without losing chat messages.

### Historical gallery recovery

Applied migration:
`20261009190000_backfill_chat_image_gallery.sql`

- 48 generated images recovered.
- 21 user-uploaded image attachments recovered.
- 69 unique gallery entries verified.
- All 69 entries have storage paths and original-message references.
- All 69 referenced storage objects and companion/conversation relationships
  were verified before recovery.
- One additional unreferenced chat-media object was left untouched.
- Recovery uses deterministic UUIDv5 IDs and conflict-safe insertion.
- Original message timestamps are preserved.

### Automated validation

- TypeScript typecheck passed.
- Six frontend image-follow-up tests passed.
- Eight backend image/gallery tests passed.
- `git diff --check` passed.
- Recovery migration dry run inserted 69 records and rolled back cleanly.
- Supabase migration applied and appears in local migration history.

### Remaining acceptance work

1. Review and commit the intended application, test, documentation,
   and migration changes.
2. Build and deploy the updated web frontend and backend.
3. Verify that all 69 historical images appear in the browser gallery.
4. Test a new direct image request and a conversational confirmation.
5. Confirm new generated and uploaded images appear in Gallery.
6. Continue the broader Heavy workload and inference-routing audit.

Do not stage unrelated `supabase/config.toml` changes or backup files.

## Cross-chat development protocol

At the beginning of every new Lumen development conversation:

1. Read this document.
2. Check `git branch --show-current`, `git log -1`, and `git status`.
3. Consult the relevant feature documentation and current implementation.
4. Distinguish implemented, tested, deployed, and user-verified states.
5. Never recommend rebuilding a completed feature without identifying
   a specific missing capability.
6. Make one bounded change, test it, review it, commit, and push.
7. Update this checkpoint whenever a workstream is completed.

## Local configuration protection

At this checkpoint, the following files have unrelated local changes:

- `supabase/config.toml`
- `supabase/config.toml.before-tail-redirects`
- `supabase/config.toml.before-tail-site-url`

Do not stage, overwrite, reset, clean, or commit these files as part
of documentation or feature work without explicit user approval.

## Supporting records

- `ROADMAP.md`
- `docs/architecture.md`
- `docs/product-design.md`
- `docs/redesign/TAKE2.md`
- `docs/assistant/STATUS.md`
- `docs/assistant/VALIDATION.md`
- `docs/everyday-capture.md`
- `docs/getting-unstuck.md`
- `docs/goals-and-practice.md`
- `docs/image-generation.md`
- `docs/vision.md`
- `docs/documents.md`
- `docs/document-actions.md`
- `docs/web-research.md`

## Chat typing performance optimization — October 9, 2026

**Status:** Implemented and locally validated; browser acceptance pending.

- Extracted the chat message renderer into a `useCallback` with explicit dependencies.
- Memoized individual web conversation message rows so ordinary draft typing
  does not unnecessarily re-render unchanged message content.
- Preserved the existing native `FlatList` implementation.
- Added `tests/conversation-render-performance.test.cjs` with three regression checks.
- Validation: 3/3 regression tests pass, TypeScript passes, and `git diff --check` passes.
- The user is testing remotely through Tailscale. Browser responsiveness must
  still be verified before claiming the typing lag is resolved.
- The previous image-generation and gallery recovery work was deployed and
  subsequently confirmed working by the user in the browser.

## October 9, 2026 — Companion-initiated image generation

**State:** Implementation and automated tests complete. Live deployment
and user acceptance remain to be verified.

### Implemented

- Conversational model can request an image through a structured internal
  `generate_image` action rather than displaying action JSON in chat.
- Supports companion self-portraits using saved visual identity.
- Uses the existing Heavy/ComfyUI image-generation integration.
- Saves generated images in private chat-media storage.
- Attaches the image to the companion's persisted chat message.
- Registers generated images in Gallery using deterministic IDs.
- Preserves ordinary incremental chat streaming while filtering internal
  image-action markup and standalone legacy JSON.
- Handles generation failures without claiming an image was created.
- Limits image-action execution to the conversational model reply branch.
- Keeps user-uploaded photo Gallery registration intact.

### Automated validation

- 249 backend tests passed.
- TypeScript typecheck passed.
- Python compilation passed.
- `git diff --check` passed.

### Remaining acceptance

1. Commit the intended backend implementation and tests.
2. Deploy the backend API.
3. Ask Raialume to show something about herself.
4. Verify a real image appears in chat and Gallery.
5. Verify ordinary text replies still stream smoothly.
6. Confirm generated self-portraits reflect saved visual identity.
