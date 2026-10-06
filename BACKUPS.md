# Local backups to Helios

Run `bash scripts/install-lumen-backups.sh` from your repository as Brett.
It installs a dedicated SSH key on `brett@100.121.251.39` (Helios), creates
a private config outside the repository, enables the nightly timer, and takes
the first backup. Initial SSH setup may request Helios's login password and
host-key confirmation. Scheduled runs use the dedicated key without prompts.

Schedule: daily at 03:00 America/Phoenix, with up to five minutes of jitter.
A missed run is caught up when the timer starts. Failed runs retry after ten
minutes. Helios must be powered on, reachable, and have Python 3 available.

New archives (manifest version 2) contain one consistent PostgreSQL custom-format
dump of **schema and data** for `public`, `auth`, and `extensions`, plus SQL migration
files, root/backend `.env` settings, Supabase config, and checksums. This includes
profiles, companion ownership, memories, conversations, and Auth accounts,
password hashes, identities, sessions, access grants, and row policies. Application data and account UUIDs
share the same snapshot. Storage files, Ollama models, and speech models are excluded.

Older version 1 archives contain public data only and use saved migrations for
schema restoration. They cannot recover login accounts. Take and check a new
backup after creating your account and claiming existing data.

Copies are stored at:

- Helios: `~/.local/share/lumen-backups/aiLumen-llm-video/` (30 copies).
- Source: `~/.local/share/lumen-backup-spool/aiLumen-llm-video/` (7 copies).

Directories are private and archives are mode 0600. SSH encrypts transfer;
archives are not encrypted at rest and contain private conversations and keys.
Keep them outside GitHub. Remote copies publish atomically only after the
checksum matches; remote retention runs only after a successful upload.
A complete local copy is retained even if Helios cannot be reached, and the
service reports failure and retries. Retention counts copies, not calendar days.

## Verify and monitor

```bash
python3 scripts/lumen_backup.py check
systemctl list-timers lumen-backup.timer
sudo journalctl -u lumen-backup -n 30 --no-pager
```

The check restores the newest local backup to a unique disposable database
in the current Supabase container. Version 2 restores the full dump; version 1
uses saved migrations and its data-only dump.
It reports restored row counts and removes the test database afterward.
It never truncates or replaces the live `postgres` database. This is a real
restore test; the first installation should be followed by a successful check.

Manual backup: `sudo systemctl start lumen-backup.service`.
Disable the schedule: `sudo systemctl disable --now lumen-backup.timer`.
Stop a failed backup's retry loop: `sudo systemctl stop lumen-backup.service`.

## Recovery after losing the source drive

1. On the replacement machine, clone the Lumen repository at the commit in
   the archive's manifest and install Node, Docker, and the backend.
2. Copy an archive from Helios using your SSH login (password login or a new
   key is needed if the original backup key was lost):
   `scp brett@100.121.251.39:.local/share/lumen-backups/aiLumen-llm-video/ARCHIVE.tar.gz .`
3. Extract it to a private directory and verify its checksums before using
   it. The backup script's `extract_checked()` function does both.
4. Rebuild local Supabase with the saved config and migration files. Recreate
   client/backend `.env` values from the saved files, updating machine URLs
   and regenerating local Supabase keys if the new stack uses different keys.
5. Run `check --archive /absolute/path/ARCHIVE.tar.gz` against the new stack
   to verify restoration before changing its live data.
6. Only on the replacement database, restore the archive using the procedure
   for its manifest version. Version 2 replaces the included schemas and data;
   version 1 recreates migrations and removes seed rows before its data restore.
   Keep the original Auth account UUIDs: creating a new account with the same
   email gives a different identity. Use a reviewed restore command for that
   exact target and stop the API during the actual restore. `check` demonstrates
   the version-specific steps only in a disposable database.
7. Verify health, conversations, memories, and voice; re-enable startup and
   backups on the replacement machine. Keep the original archive until the
   recovered system is verified.

Restore tests confirm database-data recovery within an existing Supabase
installation. A full replacement-machine recovery still needs an end-to-end
drill; do not claim it has been tested until it has.

<!-- LUMEN-CURRENT-STATE-2026-10 -->
## Current state and expansion — October 2026

The existing backup system remains the current database/Auth recovery
foundation.

It does not yet represent complete recovery of Lumen's newer multimodal state.

### Current gap: Supabase Storage

Generated chat images now live in the private Supabase Storage bucket:

`chat-media`

Database backups can preserve metadata referring to generated media without
necessarily preserving the underlying Storage object.

Therefore complete Lumen recovery now requires a tested Supabase Storage
backup/restore strategy.

### Future critical media

Before these become essential identity state, backup coverage must include:

- canonical companion reference images
- future user reference images
- other irreplaceable Gallery assets

Generated images may be reproducible in some cases, but canonical identity
references should be treated as important user data.

### ComfyUI

The known-good Lumen image workflow is versioned in Git:

`backend/workflows/flux2-klein-4b-fp8.json`

Large model weights do not necessarily need to be copied into every Lumen
backup if they can be reliably reacquired.

However, recovery documentation should record:

- exact model filenames
- model versions/revisions where available
- provider requirements
- preferably checksums

### Assistant-service data

When My Day / assistant services are integrated, verify that backup and restore
cover their database tables, including:

- tasks
- reminders
- notes
- checklists
- projects/goals
- source/provenance data

Reminder recovery must eventually include enough scheduling state to resume
reliable delivery after restoration.

### Recovery testing

A complete replacement-machine recovery drill remains a required reliability
milestone.

A future drill should verify:

1. Supabase database/Auth restoration
2. account and companion ownership
3. memories
4. assistant-service state
5. Supabase Storage
6. companion identity/reference assets
7. provider/workflow configuration
8. application startup
9. conversation
10. voice and image generation

See `ROADMAP.md` and `docs/architecture.md` for the current system boundaries.
