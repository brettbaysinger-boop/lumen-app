# Local accounts and memory ownership

Supabase Auth runs in the existing local Docker stack; no cloud project is needed.
Accounts use email/password. Signup asks for a display name; each account gets a
fresh companion with its own state and self-model. Browser sessions persist across
reloads and refresh automatically. Settings includes the current account and Sign out.
Native persistent session storage is not configured yet; this release targets
the browser. The current UI selects the oldest companion owned by the account;
a companion picker and multiple active companions are future work.

## Upgrade the existing installation

Apply the `lumen-accounts-update.patch` after the previous memory patches. Then:

```bash
cd ~/lumen-push
npm ci &&
npm run typecheck &&
node scripts/test_accounts.cjs &&
node scripts/test-voice.cjs &&
backend/.venv/bin/python -m unittest discover -s backend/tests -v &&
python3 scripts/test_backups.py -v
```

Take a backup before migrating. This uses the updated backup format and includes
Auth. The timer already runs the repository script; it does not need reinstallation.

```bash
sudo systemctl start lumen-backup.service &&
python3 scripts/lumen_backup.py check &&
npx --yes supabase migration up --local &&
sudo systemctl restart lumen-api lumen-web
```

Reload `http://localhost:8081`, choose **Create an account**, and register your
email/password and display name. If signup requires confirmation, local emails
are captured in Mailpit at `http://127.0.0.1:54324`; an administrator can open the
confirmation link there. Mailpit captures local mail rather than delivering it
to outside users. Configure real SMTP before inviting users who cannot access
your local machine. Password recovery UI and SMTP setup are not part of this update.

Your older chats will initially be invisible. They are preserved with no owner
and are deliberately not assigned to the first signup. On the main machine run:

```bash
python3 scripts/claim_legacy_account.py
```

Enter the exact email you just registered. This administrator command assigns
all unowned legacy companions to that account in one transaction, preserves every
chat/memory, and fills the reporting/subject identity for applicable older memories.
It never reassigns another account's owned data. Sign out and sign in again afterward.
A blank companion created at signup may remain; the UI selects the older claimed
companion, and no data is deleted automatically.

Review the subject labels in Memories. Old first-person facts migrate to **You**;
facts starting with the companion's possessive name migrate to **Companion**;
ambiguous facts stay **Unassigned**. Use the subject buttons to correct them.

After the two-account checks below pass, save this checkpoint to GitHub:

```bash
git add README.md BACKUPS.md ACCOUNTS.md package.json package-lock.json \
  app lib hooks types backend/lumen backend/tests \
  scripts/lumen_backup.py scripts/test_backups.py scripts/test-voice.cjs \
  scripts/claim_legacy_account.py scripts/test_accounts.cjs \
  supabase/migrations/20261004060000_accounts_and_memory_subjects.sql
git commit -m "Add local accounts, account isolation, and memory ownership"
git push origin feat/lumen-v0.1-baseline
```

Then make and check another backup containing your account and claimed data:

```bash
sudo systemctl start lumen-backup.service
python3 scripts/lumen_backup.py check
```

## Isolation and memory meaning

- `profiles.id` identifies the signed-in person, using the verified Auth UUID.
- `companions.owner_user_id` links a companion to its account.
- Memory `subject` is **user**, **companion**, **shared**, or **unknown**.
- `subject_user_id` links user/shared memories to the owning user.
- `reported_by_user_id` records the person who supplied the fact. A user telling
  Lumen about her birthday does not make it the user's birthday.
- `occurred_at` is an optional event date, separate from the save timestamp; this
  release does not infer dates from “today” or automatically create experiences.

All application tables have account-based row-level policies. Anonymous requests
see no account data and cannot write it. API chat and voice validate the access
token with Auth. Each chat request uses that token for database reads/writes,
rather than relying on the server's privileged identity. Conversation IDs must
belong to the requested companion. The health endpoint remains public.

A reported companion preference is labeled as such; it is not proof of an
independently chosen preference. Automatic reflection, reviewed memory extraction,
and resolving “remember that” from previous turns are subsequent milestones.

## Verify with two accounts

1. With your account, save `Remember my favorite color is turquoise` and
   `Remember your favorite color is violet`. Check **About you** and **About Lumen**.
2. Ask whose favorite colors they are. She should distinguish the user and herself.
3. Close/reopen the browser page; your session, chats, and labels should persist.
4. Sign out. The login screen should replace the app.
5. Register a second account with a different display name. It should start with
   a fresh companion and no access to the first account's history or memories.
6. Sign back into your original account and verify the old data remains.

Automated checks run the actual migrations and policies in an isolated PostgreSQL
WASM engine with two UUIDs, test anonymous/cross-account denial and conversation
scope, enforce memory speaker/subject identity, preserve legacy rows, and round-trip
schema/data with account UUIDs, password hashes, grants, and policies. API
checks cover missing/invalid/expired tokens and rejected foreign conversations.
Live signup, SMTP, and your full Supabase restore still require the steps above.

Reference: [Supabase Auth](https://supabase.com/docs/guides/auth),
[row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
