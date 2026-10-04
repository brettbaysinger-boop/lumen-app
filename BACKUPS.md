# Local backups to Helios

Run `bash scripts/install-lumen-backups.sh` from your repository as Brett.
It installs a dedicated SSH key on `brett@100.121.251.39` (Helios), creates
a private config outside the repository, enables the nightly timer, and takes
the first backup. Initial SSH setup may request Helios's login password and
host-key confirmation. Scheduled runs use the dedicated key without prompts.

Schedule: daily at 03:00 America/Phoenix, with up to five minutes of jitter.
A missed run is caught up when the timer starts. Failed runs retry after ten
minutes. Helios must be powered on, reachable, and have Python 3 available.

Each archive contains a consistent PostgreSQL custom-format dump of public
schema data, all SQL migration files, root and backend `.env` settings,
Supabase config, and a manifest with the code commit and checksums. It covers
conversations, messages, memories, companion identity/state, self-model,
reflections, and model runs. Supabase auth/storage schemas, storage files,
Ollama models, and Helios speech models are not included. Schema definitions
come from the saved migrations; commit schema changes as migrations before
depending on these backups.

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
in the current Supabase container, using its saved migrations and data dump.
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
6. Only on the replacement database, restore the saved data after removing
   the migration seed rows. Use an explicit, reviewed restore command for
   that target. The `check` routine demonstrates the migration, truncate,
   and `pg_restore` steps in isolation; it is deliberately not a live-data
   overwrite command. Stop the API during the actual restore.
7. Verify health, conversations, memories, and voice; re-enable startup and
   backups on the replacement machine. Keep the original archive until the
   recovered system is verified.

Restore tests confirm database-data recovery within an existing Supabase
installation. A full replacement-machine recovery still needs an end-to-end
drill; do not claim it has been tested until it has.
