# Lumen ↔ Raialume Memory Core (RMC) integration

Status: **integration candidate, offline-tested only.** Default is unchanged
(`LUMEN_MEMORY_BACKEND=supabase`). Turning RMC on for live Lumen is blocked
on a missing RMC component (below). Nothing here has been deployed, no
service was restarted, and no personal memory was read, written or migrated.

Target installation: `/data/rmc-lumen-rmc01`, installation ID `lumen-rmc01`,
frozen RMC source `bd64be1644c6401b67cf6bdceeafb8aa31245184`. RMC is used
read-only; no RMC file is changed by this work.

## 1. How the installed RMC is reached on the network today

* Each RMC generation runs on its own Docker bridge created with
  `--internal` (`rmc-lumen-rmc01-gN-net`): PostgreSQL/pgvector (`…-db`), the
  anchor (`…-anchor`, relay as PID 1) and Hindsight (`…-hs`, sharing only the
  anchor's network namespace). No container publishes a port, and the
  installer stops with `HOST_PUBLISH_DETECTED` if one does.
* Hindsight's only way out is model inference: relay `127.0.0.1:11436`
  inside its namespace → owner-only Unix socket broker on the host (socket dir
  0700, socket 0600, peer uid+gid+pid check plus token) → the existing
  `127.0.0.1:11434` Ollama.
* Raw Hindsight has **no authentication of its own**. The internal bridge is
  the only thing keeping other processes away from it.
* The RMC guards (signed V2 grants, `SessionGuardedWriter`,
  `SessionGuardedReadGateway`, privacy coordinator/gate/log, and the
  `PostgresWriteLedger`) are **in-process library code**. Whoever runs them
  must itself reach raw Hindsight and the ledger database.
* The only application client that has ever been placed on the bridge is the
  installer's `smoke` container (`scripts/rmc_cr1b1_gateway_stage.py`). It
  runs the fictional `ReferenceHost` and exits after the smoke check. It is not
  a service and it does not accept requests from a host application.

So there is **no safe application-access boundary** for Lumen in the
installed topology. The only ways to reach it today would be the ones the
brief forbids: join Lumen to the internal bridge (Lumen would then hold raw,
unauthenticated Hindsight and PostgreSQL access), publish a port, or call
Hindsight without the RMC guards. This branch does none of those.

## 2. Missing component: the RMC application gateway

A long-running, installation-owned service that is the only application
client of raw Hindsight, and that host applications reach through one narrow,
authenticated door. It needs all of the following, and all of it belongs in
the RMC repository and installer, not in Lumen:

1. **Container on the internal bridge** (`rmc-lumen-rmc01-gN-gw`), running
   the RMC SDK from the same verified wheel, with no published port, bound
   in the MACed installer state like the other generation objects, and
   started/stopped/backed-up with them.
2. **Owner-only Unix socket** for host requests, e.g.
   `/data/rmc-lumen-rmc01/run/gN/gw/gateway.sock` (dir 0700, socket 0600),
   bind-mounted into the gateway container, the same pattern as the broker
   socket but in the other direction. No TCP listener anywhere.
3. **Host authentication**: HMAC-SHA256 over path and canonical JSON body
   with a per-installation host key (`keys/gN/lumen-host.key`, 0600), plus
   timestamp freshness and single-use nonces. Lumen's side of this contract
   is `backend/lumen/rmc/client.py`.
4. **Only two operations**: `POST /v1/host/remember` and
   `POST /v1/host/recall`, each mapped to the existing guarded writer and
   reader. Grants are signed inside the gateway and never leave it.
5. **A durable host policy store** for owner binding, sessions, the learning
   and recall switches, tombstones and write blocks. Today this exists only
   as the fictional reference host (in memory, or the CR1-C PG fixture).
6. **Fixed outcome codes** that never claim a save they cannot prove:
   `stored`, `already_stored`, `uncertain`, `privacy_denied`, `denied`,
   `unavailable` for writes, and `ok` + context or a denial code for reads.

`backend/tests/rmc_fixture_gateway.py` is a **test-only** stand-in that
implements exactly this contract on a real Unix socket in front of the
unmodified RMC code. It uses the CR1-D scripted backend instead of Hindsight
and an in-process ledger instead of PostgreSQL, so it proves the Lumen side
and the contract. It does not prove a deployable gateway.

## 3. What this branch changes in Lumen

| Path | Supabase mode (default) | RMC mode |
| --- | --- | --- |
| Chat memory read (`get_relevant_memories`) | unchanged | `recall` through the gateway; on failure the turn continues without memory and the model is told memory could not be checked |
| Explicit "remember that …" | unchanged | `remember` through the gateway; the reply states the true outcome |
| "What do you remember?" listing | unchanged | RMC results, or an honest "couldn't check" |
| Natural updates, corrections, revision context | unchanged | off (they rewrite Supabase rows) |
| Automatic observations, observation retry | unchanged | off |
| Semantic indexing | unchanged | off |
| Memories tab, chat memory notices, suggestion review, undo | unchanged | hidden behind an explanatory notice |

* Flag: `LUMEN_MEMORY_BACKEND` = `supabase` | `rmc`. Any other value stops
  the API at startup. There is no fallback, double-write or migration.
* Identity: the user comes only from `require_user` (Supabase Auth). The
  companion row is read with the user's own token (RLS), and the adapter
  checks `owner_user_id == user` again before anything is sent to RMC.
* Idempotency: the RMC `source_id` is derived from installation, user,
  companion and Lumen `request_id`, so a retried request is a ledger replay
  (`already_stored`), never a second write.
* Failure reporting: `not_saved` (nothing was sent or the gateway refused),
  `unconfirmed` (it may have been stored, for example after a lost reply),
  and `memory_off` (privacy policy). None of these says "saved".
* New endpoint: `GET /v0.2/memory/backend` (signed-in users only) lets the
  app know which store is active.

## 4. Tests

```bash
cd backend
SUPABASE_URL=http://supabase.invalid SUPABASE_SERVICE_ROLE_KEY=fictional \
LUMEN_RMC_SOURCE_DIR=/path/to/raialume-memory-core@bd64be1 \
python3 -m pytest -q
```

`tests/test_rmc_integration.py` (25 tests) covers: save then recall in a
later request; streaming and non-streaming routes; no bearer → 401 and no RMC
contact; another user's recall, a foreign companion, an adapter-level
ownership check and gateway owner binding; wrong key, stale and replayed
assertions; learning off, recall off, forgotten source and private session;
idempotent retry; Hindsight outage, lost reply, gateway 5xx and gateway
absent; unsafe key/socket configuration; Supabase-only paths off in RMC mode;
flag default, invalid values and rollback. The suite refuses an RMC checkout
other than `bd64be1` unless `LUMEN_RMC_ALLOW_OTHER_SHA=YES`. Without
`LUMEN_RMC_SOURCE_DIR`, the 16 gateway tests skip and the 9 client and flag
tests still run.

## 5. Deployment procedure (do not run until the blockers are cleared)

Prerequisite: an RMC release that contains the application gateway in §2,
installed and smoke-tested as a new generation of `lumen-rmc01`, with the
owner's approval.

1. On `aiLumen-llm-video`, as the Lumen service user (the same uid that owns
   `/data/rmc-lumen-rmc01`), confirm read-only:
   `stat -c '%a %U' /data/rmc-lumen-rmc01/run/gN/gw /data/rmc-lumen-rmc01/run/gN/gw/gateway.sock`
   gives `700 <owner>` and `600 <owner>`, and the RMC installer's `status`
   reports the gateway bound and no published ports.
2. Confirm the host key file `/data/rmc-lumen-rmc01/keys/gN/lumen-host.key`
   is `600 <owner>` and its directory is not group or world writable. Never
   copy it into the repo, `.env` or logs.
3. Check out this branch into the Lumen deployment and install the backend
   (`backend/.venv/bin/pip install -e backend`). No new dependency is added.
4. Run the offline suite above against the RMC `bd64be1` checkout. Expect
   all tests to pass.
5. Leave `LUMEN_MEMORY_BACKEND` unset (or `supabase`) and restart
   `lumen-api` only when the owner approves a restart. Behaviour is the same
   as today.
6. To enable RMC, set these in the Lumen API environment (systemd drop-in or
   `backend/.env`, which is not committed):
   ```
   LUMEN_MEMORY_BACKEND=rmc
   RMC_INSTALLATION_ID=lumen-rmc01
   RMC_GATEWAY_SOCKET=/data/rmc-lumen-rmc01/run/gN/gw/gateway.sock
   RMC_HOST_KEY_FILE=/data/rmc-lumen-rmc01/keys/gN/lumen-host.key
   RMC_TIMEOUT_SECONDS=10
   ```
   Then restart `lumen-api` (owner approval required) and ship an app build
   that includes the Memories-tab change.
7. Verify with a fictional test account and a fictional companion only: say
   "Remember: Fictional Ada keeps a teal kayak named Pebble", expect "Saved
   to my long-term memories", then ask in a new chat and expect Pebble.
   Check that the RMC ledger row count grew by one and that the Supabase
   `memories` row count did not change.
8. Rollback: set `LUMEN_MEMORY_BACKEND=supabase` (or remove it) and restart
   `lumen-api`. Facts saved in RMC stay in RMC. They are not copied back.

## 6. Blockers needing owner approval

1. **Build the RMC application gateway (§2)** in the RMC repo and installer.
   This is a new RMC component and a new reviewed release, not a Lumen
   change. Until it exists, `LUMEN_MEMORY_BACKEND=rmc` makes every memory
   operation report `not_saved` or "couldn't check".
2. **Pick the host identity model.** This branch assumes Lumen is the
   authenticating host and asserts user, companion and session over the
   signed channel, and the gateway binds a companion to its first owner. The
   alternative is for the gateway to verify Supabase tokens itself, but that
   needs egress from the `--internal` bridge.
3. **Durable host policy store and privacy controls.** Lumen has no
   private-chat mode or memory on/off switch for RMC yet. Every Lumen
   conversation is sent as a `normal` session. Learning and recall switches,
   forget and private sessions are enforced only by the gateway's store.
4. **Old app builds.** Supabase RLS still lets an older app build write the
   `memories` table directly. Lumen's server never reads it in RMC mode, but
   a database-level write lock (a migration) or a forced app update is
   needed to stop that store drifting. Not done here because it changes the
   live database.
5. **Live acceptance.** A fictional-account run against the real gateway,
   Hindsight and PostgreSQL ledger is still needed. Gold Master is not
   released, and personal-memory writes stay unauthorized.
6. **Existing memories.** Nothing is migrated. Whether, and how, existing
   Supabase memories ever move to RMC is a separate decision.
