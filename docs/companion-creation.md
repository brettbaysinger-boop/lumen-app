# Guided companion creation — candidate for 022bcf6

Five steps: name/pronouns/gender, editable personality presets and description,
starter or private uploaded portrait and appearance description, server voice
selection, then review/save. Companion tab opens the same editor afterward.
Existing companions keep all identity fields and bypass mandatory setup.
New companions require creation before entering the chat tabs.

Migration 20261011080000 adds setup_completed_at and pronouns. Existing rows
receive a completion timestamp; future inserts have NULL. Provisioning remains
the existing ensure_my_companion function, with its temporary Lumen name hidden
behind setup until the user chooses a name. Cached legacy companions without
the new field remain usable; cached incomplete companions still need setup.

Owner-scoped save_companion_creation validates bounded input and updates the
companion and self-model identity in one transaction. It preserves chats,
memories, model selection, voice_enabled, vision_enabled and custom system_prompt.
The runtime now includes configured pronouns in identity context. Uploads use
the existing private portrait bucket and owner-prefixed paths. Unused provisional
uploads are cleaned up on normal cancellation; an uncertain save outcome may
retain an unused upload rather than risk deleting a successfully saved portrait.

Personality and appearance are custom text. Appearance guides generated images;
a portrait upload does not automatically supply appearance text. The starter
portrait collection is unchanged. New portrait generation/assets are not added.
Voice choices come from the existing server catalogue; native playback/preview
remains pending. An unavailable voice server does not block choosing the default.

Local checks passed: TypeScript, 24 Node tests, auth and creation component
harnesses, existing chat-management harness, two actual prompt-builder tests,
and Android JS export. Full backend suite could not run here because backend
dependencies (including httpx) are absent. PostgreSQL/migration execution,
owner-RLS transaction tests and host/browser/phone acceptance remain pending.

Host order: apply candidate, run tests, inspect local migration status, apply
only this reviewed migration and run scripts/test-companion-creation.sql via
psql with ON_ERROR_STOP=1. This script creates disposable fixtures inside a
transaction and rolls them back; it checks creation, completion, self-model
reconciliation, cross-owner denial, invalid name and cross-owner portrait denial.
Then explicitly restart the API for the prompt change and rebuild the isolated
preview APK with the changed app/lib/components files. No automatic deployment.

Acceptance: existing Lumen must retain identity/chats/memories and open normally;
customize via Companion and reopen offline; new disposable account must complete
creation, retain its chosen identity after reopening, and receive replies with
that name/personality. Test failed save/retry and account switching; one account
must never see or edit another account's companion. Web and Android checks needed.

Configuration/backups remain excluded. Memory relevance, skills and proposal
work remain paused. Push, native voice/documents, iOS and chat consolidation
remain pending.

<!-- companion-creation-accepted-2026-10-11 -->
## October 11, Phoenix — Guided companion creation accepted

Host TypeScript, 24 Node tests and all 447 backend tests passed.
Migration 20261011080000 applied locally; existing companion fields
were verified unchanged. Ownership, validation and atomic identity
tests passed with fixtures rolled back.
Database backup: /home/brett/lumen-db-backups/companion-creation.8zFfGZ

Android preview build and installation succeeded.
APK SHA256: a095946d3065766d0b1e51280e2c392782e206860134614ba6342db19641430b
Brett reports all phone tests passed, including first-time creation
on a new account.

Requested next: name suggestions, remove pronoun field from setup,
romantic personality, appearance builder, voice samples on Android,
and generated companion portrait preview/regenerate/use flow.
These enhancements are pending.
Configuration and backups preserved.
Memory relevance, skills and proposal work remain paused.
