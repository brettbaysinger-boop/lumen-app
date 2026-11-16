# D01-63 — Native RMC automatic learning from ordinary Lumen chat

**Status:** Source candidate; owner-run staging and live canary required.

## Objective

Connect ordinary Lumen user statements to the **existing** RMC02 → Hindsight native retention/extraction pipeline. RMC already extracts memories from content it receives; the missing piece was host-approved automatic ingestion. This implementation does NOT add an alternate long-term-memory engine or write to Supabase's legacy memories, observations, suggestions, or revision tables.

## How it works

- Enabled only when `LUMEN_MEMORY_BACKEND=rmc` AND `RMC_AUTO_INGEST_ENABLED=true` AND the companion's existing `auto_memory_enabled` setting is not false.
- Runs as a best-effort background task after an ordinary chat reply has been persisted. Explicit `remember that` saves, memory recall questions, actions, images, attachments, documents and goal-practice turns do not enter the automatic path.
- The existing Lumen observation candidate schema and `automatic_candidate()` safety rules **screen** the current user message for explicit, durable, non-sensitive speaker facts. The model never writes memories directly.
- Uses **verbatim substrings of the current user message**, not model paraphrases. Existing durability, ambiguity, evidence, ownership and sensitive-data checks all gate admission.
- Up to **two** distinct approved facts per message are sent through the existing `LumenRmcMemory.remember()` authenticated Unix-socket RMC gateway. Native RMC/Hindsight does actual retention/extraction. RMC's independent learning/private-session policy remains authoritative.
- Source IDs derive deterministically from the persisted original message ID plus index and remain idempotent if reprocessed.
- A model screening task can be preempted by a new foreground conversation; canceled or failed screens are not reported as saved.
- Rechecks companion ownership and Auto Memory preference immediately before any durable RMC write.
- Records only status and confirmed count on the existing **chat message metadata** (not in any Supabase memory table). The Memories screen displays the latest activity and live auto-learning state, distinguishing pending, skipped, failed/uncertain, and confirmed writes.
- Sensitive statements, questions, ambiguous facts and transient chat should not be automatically stored; a user can still deliberately use the existing explicit Save/Remember path.

## Important limitations

- Not every ordinary chat statement should be saved: high-confidence facts only.
- Screened-out facts, uncertain model results and preempted screens will not be ingested without a separate future request. This does not create a durable retry queue.
- Existing RMC learning privacy policy can still refuse an approved host write.
- No authoritative list-all of every RMC memory, delete, edit or migration is introduced.
- There is no claim that already-existing chats are retroactively processed.
- Chat metadata receipts are historical acknowledgement, not a fresh Hindsight retention audit.
- LLM screening errors cannot make chat fail; results are fail-closed.
- Legacy Supabase historical memories (139 / 198 / 3 at cutover) stay unchanged.
- Production RMC02 data, gateway source, rollback artifacts and 4:15/9:00 backup schedule remain separate.

## Required acceptance

1. Separate feature branch based on deployed D01-62S RMC Memories panel commit `ca45253a8083aa5347d14dc9beb1dd0bea239e8d` and Animated Companion baseline `f23d112ada23d6b8a49d7750345ef4f4d33233fc`.
2. Run backend unittest suite including new `test_rmc_auto_ingest.py` and RMC route tests, fail-closed frontend Node tests, TypeScript typecheck, and staged Expo web export.
3. Verify new API returns status with automatic learning **off by default** until owner enables the separate systemd environment flag.
4. Owner-authorized scoped deployment, service restart, fictional account chat-turn canary. The canary tests ordinary non-explicit chat retention and confirms a new RMC evidence match; never use real private memory as a test.
5. Confirm privacy refusal, off/auto switch behavior, no legacy Supabase memory count drift, Animated Companion intact, and backup timers untouched.
6. If canary fails, stop and inspect; do not blindly resend the same uncertain RMC write.

**Gold Master remains NOT RELEASED; original RMC deployment freeze remains historically preserved.**
