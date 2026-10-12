# Chat management candidate — 9fd757d

Adds searchable current/archive lists and a Manage action for rename, archive,
restore and permanent chat deletion on web and native. Mutations require a live
server response; failed requests retain the local chat and draft. No automatic
mutation replay. Names are trimmed and limited to 200 characters.

Archive uses the existing conversations.is_active field and retains messages and
drafts. The archived list allows opening a chat or restoring it. No database
migration or backend service restart is required.

Delete requires a second confirmation. Existing owner RLS scopes mutations;
message and observation/suggestion rows cascade with the conversation. Saved
memories, Gallery items/storage, documents, My Day items and other detached
records remain. This deletes a transcript, not all information learned from it.
Other devices purge cached copies only after a successful server listing.
An offline device cannot learn about a deletion on another device.

Successful mutations reconcile the owner cache, remove deleted messages/drafts
and invalidate older list/message reads. Archive preserves its cached draft.
Storage failures are reported separately from successful server changes.
The existing cache limits (20 chats, 200 messages per chat) remain.

Local validation: TypeScript, 21 Node tests, cache component checks, management
component checks (rename, archive/restore, failed delete, delayed list after
delete, offline reload), and synthetic Android JS export passed.
Host checks, rebuilt APK, real owner-RLS deletion and phone acceptance pending.

Run npm run typecheck and node --test tests/*.test.cjs. Optional runtime harness:
node scripts/test-chat-management-component.cjs (react-test-renderer@19.1.0).

Phone acceptance: use a disposable chat; rename and reopen; archive, search and
restore; save a draft, cancel deletion, then confirm deletion online; reopen
offline and confirm no transcript/draft remains. Check an unrelated chat and
existing Memories/Gallery/My Day items. Verify another account cannot mutate it.

Configuration/backups are excluded. No deployment, migration, service restart
or APK replacement is performed by applying this patch. Companion creation,
push, native voice/docs, iOS and transcript consolidation remain pending.

<!-- chat-management-phone-acceptance-2026-10-11 -->
## October 11, Phoenix — Chat management passed phone acceptance

User-supplied host evidence confirms patch checksum, whitespace checks,
TypeScript and all 21 Node tests passed against 9fd757d.
Brett reports the updated Android preview passed live Galaxy S22 checks:
rename, archive/restore, deletion cancellation, confirmed deletion,
offline reopening without the deleted chat/draft, and unrelated chat use.

During testing, cached chats remained available while live requests failed.
Host API/database/Ollama health reported OK; Tailscale ping reached the S22.
Android hostname lookup returned unknown host for the configured server.
Phone reboot restored connectivity; Brett then reported all checks passed.

Chat deletion preserves saved companion memories, Gallery items,
documents and My Day items. Other devices reconcile their cache when
they reconnect. Transcript consolidation remains pending.

No production service deployment or restart performed.
Configuration and backups preserved.
Memory relevance, skills and proposal work remain paused.
Next: personalized companion onboarding, mobile UI polish and push.

<!-- chat-usability-checkpoint-2026-10-11 -->
## Chat usability checkpoint — October 11, Phoenix

The first conversation usability pass is implemented but not accepted.
Previously supplied automated results: TypeScript, 47 Node tests and
488 backend tests passed. Browser/device acceptance remains pending.
Deployment completion for this pass is unverified.

See [chat usability](chat-usability.md) and
[latest session handoff](SESSION-HANDOFF-2026-10-11.md) for implementation,
limits and remaining work.
