# Lumen ↔ Raialume Memory Core (RMC) integration

Status (2026-11-09): **ready-to-deploy candidate, offline-tested.** The
default is unchanged (`LUMEN_MEMORY_BACKEND=supabase`). Nothing here has
been deployed, no service was restarted, and no personal memory was read,
written or migrated. Activation is one owner-gated command (§5) and is
reversible with one command.

Target: a **new, Lumen-owned RMC installation** with the D01-16 application
gateway, built from RMC gateway candidate
`345edd0b9231fe506f561449bad8d0702ec132f4` (passed live Docker, PostgreSQL
and Hindsight acceptance on Forge). The examples use `lumen-rmc02` at
`/data/rmc-lumen-rmc02`. The certified `lumen-rmc01` (`bd64be1`, no gateway)
stays untouched. RMC source is used read-only.

## 0. Compatibility with the working gateway (345edd0)

Compared against `scripts/rmc_app_gateway_protocol.py` and
`scripts/rmc_app_gateway_socket.py`, and exercised by
`backend/tests/test_rmc_gateway_interop.py` against that unmodified code:

| Item | Lumen client | Gateway | Result |
| --- | --- | --- | --- |
| Transport | HTTP/1.1 over Unix socket, no TCP | owner-only socket, SO_PEERCRED uid+gid | match. `lumen-api` must run as the RMC owner's uid **and** primary gid |
| Socket path | any validated absolute path | `rmc-<id>/run/gateway/gateway.sock` (stable across generations) | configure that path |
| Headers | one `Content-Type: application/json`, `Content-Length`, one signature | exactly those, no `Transfer-Encoding` | match |
| Body | canonical JSON (sorted, compact, ASCII) | must be byte-identical to canonical | match |
| MAC | `hmac-sha256` over `rmc-host-v1\0path\0body` | same | match |
| Key | raw file bytes, stripped | same reader; installer writes 64 hex chars to `keys/gateway-hosts/<host>-host.key` | match. Host name is `lumen` |
| Assertion | v1, host `lumen`, 32-hex nonce, `issued_at` | ±120 s, nonce kept in PostgreSQL | match |
| Write outcomes | 6 fixed codes | same 6 | match |
| Refusals | **was**: any non-200 = uncertain | 400/403/404/405 + `{"outcome":"denied"}`, always before any memory write | **fixed**: now `denied` → "nothing was saved". 503 stays uncertain |
| Text limit | none | 10,000 chars | **fixed**: longer text is reported not saved without sending |

Gateway behaviours Lumen relies on and does not change: first-owner
binding of a companion, private sessions, and the policy journal. A
learning-disabled write comes back as `denied` from the real engine, so Lumen
says "nothing was saved" rather than "memory is off".

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

## 2. The RMC application gateway (was missing on 2026-11-02; now D01-16)

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

### App behaviour: fail closed

The app writes Supabase memories directly (Memories tab add, edit, subject,
delete, suggestion review, observation retry; chat suggestion review and
"Undo"; correction undo), so the app must never assume Supabase is active.
`lib/memory-backend-core.ts` decides, and `lib/memory-backend.ts` wires it in:

* Supabase memory screens are shown, and Supabase memory rows read, only
  while the server has answered exactly `{"backend":"supabase"}` for the
  **same signed-in account** within the last 30 seconds.
* Checking, no API address, network error, timeout, any HTTP error
  (including 404), a malformed answer, an account change during the request,
  or an answer older than 30 seconds all mean **unavailable**. The Memories
  tab then shows a read-only notice with "Check again", and chat hides
  memory notices and suggestions.
* A remembered answer is only a display hint. **Every Supabase memory write
  first asks the server again**. It goes ahead only if that new answer is
  `supabase` for the same account, and otherwise shows "nothing was changed".
  A test fails if any such write in the app lacks this check.
* Only the newest check for the current account can change the state, so a
  slow old answer cannot win a race against a newer one, and one account's
  answer is never applied to another.
* The app re-checks on sign-in, sign-out and account switch, when the app
  returns to the foreground, on browser `online` and `focus`, when the
  Memories or Chat screen gains focus, every 15 seconds while signed in, and
  every 10 seconds after a failure.

### Gateway socket checks

Before every request, `validate_socket` refuses the socket unless the path
is absolute and normalized with no symlink anywhere in it
(`realpath == path`), its directory is a real directory owned by the Lumen
service uid with mode 0700, and the socket itself (checked with `lstat`) is
a socket owned by that uid with no group or other permissions. Because the
directory is owner-only, no other account can swap the socket between the
check and the connect. The host key file gets the same symlink check. A
refused socket means nothing is sent, and the result is `not_saved` or
"couldn't check".

## 4. Tests

```bash
cd backend
SUPABASE_URL=http://supabase.invalid SUPABASE_SERVICE_ROLE_KEY=fictional \
LUMEN_RMC_SOURCE_DIR=/path/to/raialume-memory-core@345edd0 \
python3 -m pytest -q
# outside the venv, as an ordinary user:
scripts/test-rmc-memory-guard-sql.sh          # needs local PostgreSQL binaries
scripts/test-lumen-rmc-script.sh              # activation script, all stubs
node --test tests/memory-backend.test.cjs
```

* `tests/test_rmc_gateway_interop.py` (8): the Lumen client and adapter
  against the **real** gateway transport, authentication and key reader
  from 345edd0 on a real socket. Covers save, retry and recall; full
  streaming and non-streaming Lumen turns; first-owner binding and bank
  isolation; wrong key, stale clock, wrong installation and revoked host;
  private session; engine failures; oversized text; and a peer with another
  gid. The PostgreSQL registry and Hindsight engine are stand-ins here
  because they were accepted live on Forge.
* `tests/test_rmc_integration.py` (33): the Lumen side end to end with the
  RMC SDK and reference host behind a test gateway. Covers auth, isolation,
  privacy switches, idempotency, failures, socket safety, the flag and
  rollback, plus gateway refusal statuses.
* `scripts/test-rmc-memory-guard-sql.sh` (13 checks, throwaway PostgreSQL):
  the guard is idempotent and changes nothing in Supabase mode. In RMC mode
  it refuses insert, update and delete on all three memory tables, through
  security-definer RPCs too, and refuses clients touching the guard row.
  Reads and rows are kept, and rollback reopens writes.
* `scripts/test-lumen-rmc-script.sh` (21 checks): preflight, owner
  confirmation, activation, status, rollback, automatic abort on an
  unhealthy API or a Supabase row-count change, and preflight failures for
  bad socket, directory or key modes, a published port, a missing gateway,
  a `.env` override, the `lumen-rmc01` path and a dead gateway.
* `tests/memory-backend.test.cjs` (12): the fail-closed app logic.

## 5. Deployment (owner-gated; nothing here has been run)

**Step A: the Lumen-owned RMC installation (RMC side, after GW03).** Use
the RMC installer from the final gateway SHA to make a NEW installation
(for example `lumen-rmc02` at `/data/rmc-lumen-rmc02`) as the same user that
runs `lumen-api`. Follow `docs/RMC-INSTALLER.md` in that RMC SHA, with its
own owner gates. Then enroll Lumen as a host:
`rmc_installer.py gateway-host --host lumen --install-dir /data/rmc-lumen-rmc02`.
This creates `keys/gateway-hosts/lumen-host.key` (0600). Never reuse or
modify `lumen-rmc01`, and do not copy keys or memories into the new
installation.

**Step B: Lumen checkout.** On the Lumen host, check out this branch in the
existing Lumen repo (the Supabase default keeps behaviour unchanged). Then
`backend/.venv/bin/pip install -e backend`, which adds no new dependency, and
restart `lumen-api` in a maintenance window you approve. Rebuild the web/app
so the fail-closed Memories tab ships.

**Step C: read-only preflight**, which changes nothing:

```bash
scripts/lumen-rmc.sh preflight --rmc-dir /data/rmc-lumen-rmc02 --installation-id lumen-rmc02
```

It checks the `lumen-api` user, the adapter in this checkout, that `.env`
does not override the backend, API health, the installer `status`, the
socket and key ownership and modes, a running gateway, no published ports,
a 405 liveness answer, and that Lumen's own adapter accepts the socket and
key.

**Step D: activate (the one owner-gated command).**

```bash
LUMEN_RMC_CONFIRM=activate:lumen-rmc02 scripts/lumen-rmc.sh activate --rmc-dir /data/rmc-lumen-rmc02 --installation-id lumen-rmc02
```

It re-runs the preflight and saves rollback evidence (environment and row
counts only) to `~/.local/state/lumen-rmc/`. It applies
`supabase/rmc/memory_store_guard.sql` with the row set to `rmc`, writes
`/etc/systemd/system/lumen-api.service.d/60-lumen-rmc.conf` (paths only,
never the key), restarts `lumen-api` and checks health, the setting and
unchanged Supabase row counts. On any failure it restores Supabase mode by
itself and prints `ACTIVATION_ABORTED`.

**Step E: verify with a fictional account only.** Say "Remember: Fictional
Ada keeps a teal kayak named Pebble" and expect "Saved to my long-term
memories". Ask in a new chat and expect Pebble. `status` should show RMC
mode, and the Supabase row counts should be unchanged.

**Rollback (one command, any time):**

```bash
LUMEN_RMC_CONFIRM=rollback:lumen-rmc02 scripts/lumen-rmc.sh rollback --installation-id lumen-rmc02
```

It removes the drop-in, restarts `lumen-api`, then sets the guard row back
to `supabase`. Facts saved in RMC stay in RMC. Supabase memories were never
changed.

Side effects to expect while RMC is active. Supabase memory rows are
read-only at the database, so deleting a companion or account whose
memories would cascade fails until rollback. The Memories tab shows a
notice instead of the Supabase list. Chat, voice, avatars, documents and
other services are untouched.

## 6. Remaining owner gates

1. **GW03**: final same-SHA and post-backup privacy-rewind acceptance of the
   gateway (RMC release blockers). Activate only on the SHA that passes.
2. **Step A install** of the Lumen-owned RMC under the RMC installer's own
   owner authority.
3. **Maintenance window** for the Step B restart and the Step D command.
4. **Privacy controls in Lumen**: Lumen has no private-chat mode or memory
   on/off switch yet. Every conversation is a `normal` session. Privacy
   changes go through RMC's `gateway-policy` command.
5. **Existing memories**: nothing is migrated. Personal-memory writes and
   Gold Master remain unauthorized.
