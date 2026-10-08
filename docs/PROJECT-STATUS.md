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
