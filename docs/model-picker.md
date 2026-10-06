# Conversation model picker

Choose an installed Ollama model from the chat header or Settings → Companion Configuration. The choice is saved on your companion record and used for subsequent replies, including a corrective rewrite. Existing history, identity and memories are retained. A request already running completes with the model captured at its start.

Use backend default clears the saved override. MEMORY_OBSERVATION_MODEL still controls extraction; if empty it now follows the selected companion model, then the backend CONVERSATION_MODEL fallback. See chat-and-natural-memory.md for scheduling and automatic remembering. Reflection, embeddings and voice settings are unchanged.

This update combines the UI refresh with the natural-memory baseline, preserving suggestion review/edit/dismiss and retry. It also persists themes on native devices with AsyncStorage, validates stored theme names, and updates the desktop GPU label.

Install the included migration on the local database before using the picker. The API lists models from Lumen's configured Ollama endpoint, checks companion access using the signed-in user's database permissions, rejects unknown model names, and persists the choice using those same owner policies. Model listing only includes downloaded models; choosing a model does not download or run it. Ollama loads it when the next reply is generated. Models must support chat; embedding-only models cannot generate replies.

## Validation

- Backend: 50 tests passed, including selection/reset, failed validation, unauthorized access, ownership denial and reply/rewrite selection.
- TypeScript typecheck passed.
- Database migration, memory workflow, account isolation and backup round-trip checks passed, including owner-only model updates.
- Browser voice lifecycle checks passed.
- Expo web export passed with placeholder local configuration.

No live Ollama, local Supabase, browser sign-in or native device was available in this checkout. Verify those on the desktop after installation: select a model, send a message, switch models, send another message, check saved messages' model_used values, then refresh and confirm the selection persists. Sign in as a different account and verify settings remain independent. Run the existing memory/voice smoke tests as well. The subsequent natural-chat update adds conservative automatic saving; uncertain facts still use these review controls.

<!-- LUMEN-CURRENT-STATE-2026-10 -->
## Current state — October 2026

Companion-scoped conversation-model selection remains part of the integrated
architecture.

Changing the selected conversation model changes which model supplies
conversation inference.

It does not replace Lumen's persistent identity.

The following remain application/companion state across model changes:

- companion UUID
- account ownership
- conversations
- memories
- portrait
- visual identity
- voice configuration
- generated media
- future assistant-service state

### Capability routing direction

The current model picker is conversation-model oriented.

Future provider architecture should generalize selection/routing around
capabilities such as:

- `llm`
- `vision`
- `image`
- `video`
- `tts`
- `stt`

A physical machine may expose multiple capabilities.

The frontend should not need to know which machine fulfills a capability.

### Current validation checkpoint

At integrated commit:

`6ccfcbc Add persistent companion visual identity`

the backend suite contains 66 passing tests and TypeScript validation passes.

The separately developed My Day/assistant-services feature line reports a
larger test count, but that count must not be used as the integration-branch
baseline until the feature line is merged and revalidated.

See `docs/architecture.md` and `ROADMAP.md`.
