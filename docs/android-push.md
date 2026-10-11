# Android notifications

Candidate based on host checkpoint 9e010c6. Android first; iOS and web push
remain pending. Uses expo-notifications and direct Firebase Cloud Messaging
HTTP v1. No EAS account or hosted conversation database is required.

## Behavior

Settings provides explicit permission/enable, disable, test and Android settings
controls. Notifications are disabled until the owner opts in on this device.
Registration renews at startup, foreground and token changes. Bindings expire
after 30 days without renewal. Account changes rebind known installations with
notifications disabled for the new owner until they opt in. Foreground display
and tapping are checked against the current account. Tapping opens My Day;
notification data never chooses an arbitrary navigation URL.

Delivery is a separate server worker, polling every 15 seconds. Due open My Day
reminders from the last 24 hours are queued once per device and scheduled time.
No reminder title, notes, chat transcript or companion name is sent to Google:
only generic notification text and routing identifiers. Completed, archived,
deleted or rescheduled reminders are checked before sending. New registrations
may receive still-open reminders from the last 24 hours.

Jobs use database leases, bounded exponential retries (maximum five attempts),
and stable Android notification tags to reduce duplicate tray entries. FCM
acceptance marks a job sent; it does not prove the phone displayed it. Invalid
tokens are disabled. Terminal jobs are retained 30 days. There is an unavoidable
small race between final database checks and the external send; delivery is not
an exactly-once guarantee. Notifications already accepted by FCM cannot be
retracted. TTL is one hour. Internet access is needed for FCM delivery; tapping
the private preview still needs Tailscale for live My Day data.

Disable reports success only after server confirmation. Offline sign-out still
completes, clears local opt-in and dismisses existing tray notifications; server
revocation is best effort. Generic old-account alerts can still arrive while
signed out until revocation, next connected account rebind or expiry. They cannot
open old-account content. Use Android's notification setting to block delivery
immediately when offline. Android force-stop can prevent delivery until reopened.

## Host setup after tests

Do not install or start the worker before the migration, dependencies and
private credential are ready. No credentials are included in this patch.

- Local database: migration `20261011150000_android_push.sql`; take pg_dump first.
- API and worker backend environment:
  `PUSH_ENABLED=true`
  `FIREBASE_SERVICE_ACCOUNT_FILE=/home/brett/.config/raialume/firebase-service-account.json`
- Install backend dependency changes with the existing virtual environment.
- Worker command: `.venv/bin/python -m lumen.push_worker`, working directory
  `/home/brett/lumen-push/backend`, Linux user `brett`.
- Configure a dedicated systemd unit only after backing up existing environment
  files and verifying any existing worker unit. Restart API explicitly.
- Firebase project: `raialume`; Firebase Cloud Messaging API must be enabled.
- Preview Android package remains `com.raialume.preview`.
- Copy Downloads/google-services.json into the isolated preview build only and
  set `expo.android.googleServicesFile` there. Never copy the service-account key
  into the APK. Apply the expo-notifications plugin using prebuild without clean;
  preserve preview app identity and signing key, back up native build files first.

## Verification

`npm run typecheck`
`node --test tests/*.test.cjs`
`node scripts/test-push-sql.cjs`
Backend: `.venv/bin/python -m unittest discover -s tests -q`

SQL tests exercise real PostgreSQL semantics through PGlite, including role
permissions, hidden tokens, claims, leases, schedule changes, account rebinding,
revocation and rate limiting. Also validate the migration against the host DB.
Host validation: run `scripts/test-push.sql` through psql with ON_ERROR_STOP;
fixtures roll back and no push messages are sent. Native client tests use mocked platform APIs; real FCM and native phone tests
remain required. No production deployment or phone push acceptance is claimed.

Phone acceptance: explicit permission, test in foreground/background/closed
app, tap-to-My-Day, due reminder, reschedule/cancel/delete before due, disable,
account switch, sign-out and connectivity restoration. Existing chats, cached
drafts, companion setup, portrait generation and voice samples must still work.

<!-- android-push-accepted-2026-10-11 -->
## October 11, Phoenix — Android push notifications accepted

Host TypeScript, all 36 Node tests and all 459 backend tests passed.
Queue tests passed. Both push migrations were applied locally:
20261011150000_android_push.sql
20261011160000_push_rpc_permissions.sql

Host validation caught Supabase default function grants exposing worker
claims to authenticated users. The corrective migration explicitly revoked
API-role access and regranted only the intended functions. Actual database
ownership and permission tests then passed with fixtures rolled back.
Backend dependencies installed; pip check passed.

API and lumen-push.service reported active; API/Ollama/database health OK.
Worker enabled for startup. Existing environment files preserved; push
configuration uses /home/brett/.config/raialume/push.env and an API drop-in.
Firebase service-account key remains outside Git and the APK.

Android build and ADB installation succeeded.
APK SHA256:
5b5429b9e7aabdc98f8d874e8aedfcb12e5bfd3b6451cd1b9a542d8b32aff2d6
Native build/APK backup:
/home/brett/lumen-android-builds/before-push.pmv2Zk
Database correction backup:
/home/brett/lumen-db-backups/push-permissions.4NDBrD

Brett reports all phone acceptance checks passed on the existing Lumen
account and a newly created account: live notifications, tap-to-My-Day,
background reminders, cancellation/deletion before due, disable/re-enable,
sign-out and account switching.

Direct FCM delivery uses generic notification text; reminder details remain
on the local backend. Offline sign-out revocation is best effort, and
already queued notifications cannot be recalled. Delivery is not guaranteed
exactly once. See docs/android-push.md for behavior and limitations.

Supabase configuration and existing backups preserved.
No web deployment or Git push performed in this checkpoint.
Memory relevance, skills and proposal work remain paused.
Further mobile UI polish, iOS testing and iOS push remain pending.
