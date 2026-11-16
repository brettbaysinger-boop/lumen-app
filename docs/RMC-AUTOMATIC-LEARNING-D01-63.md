# D01-63 — Automatic RMC learning: LIVE OPERATIONAL ACCEPTANCE

## Owner-observed D01-63E production acceptance

**Date:** 2026-11-15 America/Phoenix. **Result: `D01_63E_RESULT=PASS`** (owner-supplied terminal output). This is a working, scoped automatic-learning feature, **not** a Gold Master or blanket release of RMC.

### Evidence from the owner-run deployment

- Staged build: `LOCAL_ROUTER_ENTRY_FILENAME=VERIFIED`, `STAGED_BUNDLE_REPAIR=PASS`, `RMC_AND_AUTO_ACTIVITY_IN_BUNDLE=PASS`, `STAGED_WEB_BUILD=PASS`.
- Owner explicitly authorized: `AUTHORIZE D01-63 LIVE AUTOMATIC MEMORY`.
- Scoped backend source applied; `NEW_BACKEND_AUTH_GATE=PASS`.
- Fictional normal-chat canary (not an explicit remember command): `FICTIONAL_NORMAL_CHAT=PASS`.
- Native Hindsight/RMC memory ingestion: `NATIVE_RMC_AUTO_INGEST=PASS`; save receipt: `RMC_AUTO_RECEIPT=CONFIRMED`; subsequent retrieval: `FICTIONAL_RMC_FACT_RECALL=PASS`.
- Historical Supabase memory counts unchanged; no migration.
- Final owner receipt: `RMC_MEMORIES_PANEL=LIVE_AND_PRESERVED`, `RMC_AUTOMATIC_LEARNING=ENABLED`, `RMC_AUTOMATIC_EXTRACTION=ON_VIA_NATIVE_HINDSIGHT`, `ANIMATED_COMPANION=RETAINED`, `RMC02_ENGINE_AND_CONFIGURATION=UNMODIFIED`, `BACKUP_TIMERS=UNMODIFIED`.
- Exact **deployed feature-source pin:** `05232f78d10d2c845b9b10473f42de4ecac5c7f2`. The Lumen checkout itself remains at the Animated Companion source `f23d112ada23d6b8a49d7750345ef4f4d33233fc` because the deployment copied only approved feature files.
- Rollback snapshot exists **only on Lumen** at `/home/brett/.local/state/lumen-rmc/d01-63-zm46KZwo`. It and all live keys/data are intentionally excluded from Git. The fictional test fact is durable and will not be undone automatically by an application rollback.

### What this verifies—and does not

- **Verified:** one authenticated fictional ordinary-chat turn was screened, retained through the native RMC gateway, confirmed in the receipt, and recalled successfully.
- **Bounded scope:** only eligible, durable non-sensitive user statements are automatically ingested; ambiguous, transient, sensitive and opt-out cases remain filtered or RMC-denied. Not every conversation is stored. The existing companion Auto Memory preference is honored.
- **Not verified by this single canary:** sustained learning quality across varied real-world conversation, comprehensive list-all memory catalog, personal memory migration, full gateway disaster recovery, or any Gold Master certification.
- **Release handling:** source PR stays draft/unmerged until separate review. The D01 original production code freeze is preserved. This docs-only follow-up does not modify the deployed feature bytes.

### Prior failed attempts, retained for audit

D01-63/63B failed predeployment Expo bundle checks; D01-63C reached a fictional canary but returned `no_durable_fact`; rollback health was initially unconfirmed due to an immediate port check. D01-63D verified the rollback, API healthy and backup timers intact with no changes. The targeted preference classifier fix plus D01-63E owner-run canary resolved the bounded false-negative scenario. No earlier uncertain canary was resent.

---

# Original D01-63 implementation plan (historical pre-activation)

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
