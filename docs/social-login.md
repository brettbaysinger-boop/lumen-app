# Social sign-in with local Supabase

The login screen discovers enabled providers from your own Supabase Auth service's public `/auth/v1/settings` endpoint, then offers Continue with Google/X and other supported configured providers (Apple, GitHub, Microsoft, Facebook). Email/password remains available. An unavailable provider is not advertised as a working option. No provider secrets enter the frontend, API responses, or repository.

Social login signs up new users as well as signing in existing users. It still uses local Supabase user IDs and existing RLS. It does not migrate conversations to a cloud database. Google/X contact their identity services for authentication. Supabase may automatically link the same verified email to an existing account; a different email can create a separate account. For an existing companion, sign in with email first and use Account → Connect Google/X. Enable manual linking on the Auth server. Do not merge account rows or change owner IDs manually.

Web returns to the current origin's `/login` path; no user-controlled next URL is accepted. Existing Supabase session detection consumes the OAuth callback, and existing companion bootstrap runs for the returned user. Provider names populate the initial profile display name. Native uses the existing Expo browser and linking packages with an exact matching return URI and validated session installation; native flow requires a registered app deep link and has not been verified on a device.

## Two different redirects

1. Provider callback: Google/X → Supabase Auth, e.g. `http://127.0.0.1:54321/auth/v1/callback` for local Google development. Register the EXACT chosen address with the provider and configure it in the provider's `redirect_uri` if needed.
2. App redirect: Supabase Auth → Lumen, e.g. `http://localhost:8081/login`. Add this exact URL to `auth.additional_redirect_urls` and set `auth.site_url` to the actual Lumen origin. Use your real port.

On another device localhost points to that device, not the desktop. LAN/Tailscale use requires a browser-reachable Auth endpoint and matching frontend URL allowlist. Google generally requires HTTPS and an allowed hostname outside loopback development; don't assume a raw LAN IP or a private hostname will be accepted by either provider. Keep localhost working first; configure the remote hostname/callback separately after confirming provider rules.

## Google setup (no hosted Supabase project needed)

In the Google Auth Platform console, create a Web application OAuth client. Set your Lumen origin as an authorized JavaScript origin and the local Supabase Auth callback as an authorized redirect URI. Configure consent/test users as required by Google. Save client ID and client secret only on the server.

In the ignored root `.env`, add actual values for `SUPABASE_AUTH_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_GOOGLE_SECRET`. Do not prefix either with EXPO_PUBLIC. In your EXISTING `supabase/config.toml`, edit the existing Google section (do not append a duplicate table):

```toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_GOOGLE_SECRET)"
redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"
skip_nonce_check = false
```

In the existing `[auth]` section:

```toml
# Substitute your actual URL/port, preserve other existing redirects.
site_url = "http://localhost:8081"
additional_redirect_urls = ["http://localhost:8081/login", "http://127.0.0.1:8081/login"]
enable_manual_linking = true
```

Auth config changes require restarting the local Supabase stack with normal stop/start. Back up before doing so; don't use `db reset` or `stop --no-backup`. Preserve project_id, database settings, migrations, and other auth settings. These snippets are intentionally not applied by the code patch: the desktop's config is local and not available in this checkout.

## X

Current Supabase documentation recommends OAuth 2.0 provider `x`, not legacy OAuth 1.0a `twitter`. Create an X Web App OAuth2 client with the exact Auth callback, website, privacy/terms URLs, and email permissions required by X. The UI recognizes modern `x` when Auth reports it enabled. The pinned JS SDK predates the TypeScript provider name but passes the validated runtime provider string through unchanged.

The current CLI reference's external-provider list does not list `x`; confirm installed CLI/Auth support before editing local config. Do not substitute OAuth2 client credentials into legacy `[auth.external.twitter]`. Capture the desktop CLI version and Auth container version/settings, then choose the supported server configuration. No legacy X callback or unverifiable local config is installed by this patch.

## Verification

Run TypeScript, `node scripts/test-social-auth.cjs`, existing backend/account isolation checks, and web export. The policy tests cover enabled-provider filtering, fixed same-origin return URLs, cancellation, strict native callback matching and missing tokens. Real Google/X callbacks require registered provider apps and credentials, and are not tested by this patch. Start with the existing email account → Connect Google; confirm the same user ID, companion, history and memories after logout/social login. Test cancel/retry and a different provider account without crossing owner boundaries.

References: https://supabase.com/docs/guides/auth/social-login/auth-google
https://supabase.com/docs/guides/auth/social-login/auth-twitter
https://supabase.com/docs/guides/local-development/managing-config
https://supabase.com/docs/guides/local-development/cli/config
https://supabase.com/docs/guides/auth/auth-identity-linking
