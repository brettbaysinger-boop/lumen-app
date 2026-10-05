# Conversation model picker

Choose an installed Ollama model from the chat header or Settings → Companion Configuration. The choice is saved on your companion record and used for subsequent replies, including a corrective rewrite. Existing history, identity and memories are retained. A request already running completes with the model captured at its start.

Use backend default clears the saved override. MEMORY_OBSERVATION_MODEL still controls extraction; if empty it falls back to the backend CONVERSATION_MODEL setting, not the new picker. This keeps chat experiments separate from the existing memory pipeline. Reflection, embeddings and voice settings are unchanged.

This update combines the UI refresh with the natural-memory baseline, preserving suggestion review/edit/dismiss and retry. It also persists themes on native devices with AsyncStorage, validates stored theme names, and updates the desktop GPU label.

Install the included migration on the local database before using the picker. The API lists models from Lumen's configured Ollama endpoint, checks companion access using the signed-in user's database permissions, rejects unknown model names, and persists the choice using those same owner policies. Model listing only includes downloaded models; choosing a model does not download or run it. Ollama loads it when the next reply is generated. Models must support chat; embedding-only models cannot generate replies.

## Validation

- Backend: 50 tests passed, including selection/reset, failed validation, unauthorized access, ownership denial and reply/rewrite selection.
- TypeScript typecheck passed.
- Database migration, memory workflow, account isolation and backup round-trip checks passed, including owner-only model updates.
- Browser voice lifecycle checks passed.
- Expo web export passed with placeholder local configuration.

No live Ollama, local Supabase, browser sign-in or native device was available in this checkout. Verify those on the desktop after installation: select a model, send a message, switch models, send another message, check saved messages' model_used values, then refresh and confirm the selection persists. Sign in as a different account and verify settings remain independent. Run the existing memory/voice smoke tests as well. No existing memory approval behavior was changed.
