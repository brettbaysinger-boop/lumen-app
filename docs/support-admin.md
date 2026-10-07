# Restricted account support

This development checkpoint adds an account-support dashboard and password
recovery page. It has been validated with mocked services and a PostgreSQL
fixture; local Auth mail delivery remains a deployment check.

## Scope

Support can view paginated account email/ID, creation/confirmation/sign-in dates
and ban status; remove a login ban; and request a recovery email. A ban removal
does not remove Auth rate limits, repair a deleted account, or bypass OAuth.
Ordinary sign-in still verifies the caller with local Auth. Authorization uses
the verified account UUID and backend configuration, not editable user metadata.

No support route reads companion tables, storage, messages, memories, notes,
documents, or photos. Existing owner-based RLS is unchanged. The backend keeps
service-role credentials private and exposes only fixed Auth/account operations.
There is no user-password setting, token/link generation, impersonation, email
change, role change, deletion, or arbitrary privileged proxy endpoint.

Support account UUIDs are configured in `backend/.env`:

```dotenv
SUPPORT_ADMIN_USER_IDS=DEDICATED_ACCOUNT_UUID
SUPPORT_RECOVERY_REDIRECT_URL=http://YOUR_LUMEN_ADDRESS:8081/recover
```

Blank `SUPPORT_ADMIN_USER_IDS` disables access. Restart the API after changes.
Use a separate account created through normal signup. Its own private data, if
any, remains owner-scoped like any other account. Settings shows the signed-in
account ID; only allowlisted accounts see “Open account support”. Unauthorized
direct access to `/support` or its API is denied.

## Recovery setup

Add the exact recovery URL to `[auth].additional_redirect_urls` in
`supabase/config.toml`. Localhost recovery URLs are included in this checkpoint.
LAN/Tailscale names must be added for the address users actually open; do not
assume a returned redirect was honored without testing the email link. Local
Supabase must be stopped and started to apply Auth configuration changes. Keep
the existing Google/login callback entries. Restart API/web afterward.

Recovery calls Auth's email-delivery endpoint; no link or token is displayed in
the support UI. The user follows the email to `/recover`, chooses a password,
and is signed out before signing in with the new password. Forgot-password is
also available on the login screen. Auth may intentionally return an accepted
request without revealing whether an email is eligible. “Accepted” is not a
delivery receipt. OAuth-only accounts should ordinarily recover through their
provider; do not assume this flow can repair provider access.

Local Mailpit captures email for development; it does not deliver email to end
users' inboxes. Configure real SMTP and test delivery before offering remote
user recovery. This app-level support role cannot browse Mailpit. The machine
operator's root/database/Mailpit privileges are outside the support UI and can
access information; this is not cryptographic protection against the host owner.

## Audit

Migration `20261007001500_support_audit.sql` creates a service-only audit table.
An event is written before the side effect, then marked accepted/failed. If the
initial audit write fails, no account action proceeds. If completion recording
fails after the action succeeds, the API warns that the action was accepted and
requires checking the log before retrying. Events retain actor/target IDs without
foreign-key cascades so deleting an account does not remove their audit history.
Browser roles have no direct table privileges. The service role may update only
status/completion fields and cannot delete events through its ordinary grants.

## Validation

- Backend suite: 105 passing tests, including unauthenticated/ordinary account
  denial, response projection, no secret forwarding, narrow unlock payload,
  fixed recovery redirect, and audit-before-action behavior.
- PostgreSQL fixture: actual migration privileges checked, including denied
  browser reads/writes and denied service-role deletion/action rewriting.
- Existing account/memory isolation and backup restore tests passed with all
  migrations; the test fixture now includes Storage tables used by newer
  migrations. Social-login regression checks passed.
- Typechecking and Expo web export passed.
- Browser fixture: denied ordinary-account screen, authorized account listing,
  unlock and recovery actions, mobile layout, and user-owned password update.

The browser test is `scripts/test-support-browser.cjs`; use installed Playwright
or `LUMEN_PLAYWRIGHT_MODULE` as in the conversation regression. It mocks Auth/API
responses and does not prove SMTP delivery or live GoTrue version compatibility.

## Install checkpoint

Import `lumen-account-support.bundle` on the existing clean Take 2 branch, then
typecheck, apply the migration, export web, and restart API/web. No new packages
are needed. Configure the support UUID, recovery address, and Auth redirect
allowlist only after selecting the dedicated account and deployment URL.
