# HTTPS for mobile camera and microphone

This checkpoint prepares private HTTPS access with Tailscale Serve and switches
the existing web service from Expo development mode to the exported app.
Serve terminates TLS; local upstream services retain their existing HTTP ports.
It is not public hosting and does not use Funnel.

For this deployment, `HOST` is `ailumen-llm-video.tail577ac1.ts.net`:

| Address | Upstream | Purpose |
| --- | --- | --- |
| `https://HOST` | `http://127.0.0.1:8081` | Exported Lumen app |
| `https://HOST:8444` | `http://127.0.0.1:8001` | Authenticated Lumen API |
| `https://HOST:8445` | `http://127.0.0.1:54321` | Supabase gateway, including Auth, REST and Storage |
| `https://HOST:8443/auth/v1/callback` | Existing callback proxy | Google callback; retained |

Use the full DNS hostname, not `https://100.75.227.45`: the certificate is for the
DNS name. Client devices need Tailscale connected and permission to reach these
ports. Existing HTTP web entry points remain served on port 8081; their exported
frontend now also uses the HTTPS API and Supabase addresses. Those devices need
Tailscale DNS/access as well.

## Configuration

`scripts/configure-tailnet-https.py --hostname HOST` prepares:

- client `.env`: HTTPS API on 8444, Supabase on 8445; other keys retained;
- server `backend/.env`: HTTPS CORS origin plus existing/known HTTP origins;
  support password recovery points to the HTTPS `/recover` route;
- `supabase/config.toml`: HTTPS default site URL, HTTPS root/login/recovery
  redirects, localhost redirects and all existing redirect entries;
- dated, mode-0600 backups under ignored `.https-backups/` with private directories.

The script validates all three inputs before writing. Backups are made before
changes. Individual writes are atomic; the three-file operation is not a single
transaction, so a disk failure during writing may require restoring the backup.
Google's existing external callback configuration is preserved. No new Google
Console redirect is required for this setup: its registered 8443 callback remains.
Backend private Supabase/Ollama/Helios addresses and account allowlists are retained.

## Install

Fetch/merge the checkpoint bundle first, then run from the repository root:

```bash
python3 scripts/configure-tailnet-https.py \
  --hostname ailumen-llm-video.tail577ac1.ts.net &&
sudo tailscale serve --bg --https=443 http://127.0.0.1:8081 &&
sudo tailscale serve --bg --https=8444 http://127.0.0.1:8001 &&
sudo tailscale serve --bg --https=8445 http://127.0.0.1:54321 &&
npm run typecheck &&
npm run build:web &&
bash scripts/install-static-web.sh &&
"$HOME/.local/share/lumen-tools/node_modules/.bin/supabase" stop &&
"$HOME/.local/share/lumen-tools/node_modules/.bin/supabase" start &&
sudo systemctl restart lumen-api.service lumen-web.service
```

These commands add mappings on 443/8444/8445; the user's previously observed
configuration has only 8443. Check `tailscale serve status` before applying on
other machines with existing mappings on these ports. Do not use `serve reset`.
Serve HTTPS must be enabled for the tailnet; it was already working for this
deployment's Google callback. A failure stops the chain: resolve it before moving
on to the next command. Supabase restart briefly interrupts Auth/database access.

The web installer adds only
`/etc/systemd/system/lumen-web.service.d/50-static-export.conf`, retaining the base
unit's user/startup settings. It uses the current Node executable, including nvm
paths. Exported files are served on all interfaces on port 8081, as the existing
web app was. The static server supports `/login`, `/recover`, `/support`, and tab
deep links; missing assets return 404. Responses revalidate rather than retain
an obsolete build. No extra npm package or database migration is required.

Future frontend changes require `npm run build:web` before restarting the web
service. Typechecking alone or editing source no longer updates the served UI.

## Verify

```bash
tailscale serve status
curl --max-time 15 -fsS https://ailumen-llm-video.tail577ac1.ts.net:8444/health
curl --max-time 15 -fsS https://ailumen-llm-video.tail577ac1.ts.net:8445/auth/v1/health
```

On the phone, close the old HTTP tab and open
`https://ailumen-llm-video.tail577ac1.ts.net`. Sign in again: HTTPS is a new browser
origin and the Supabase host also changed, so old local sessions do not migrate
automatically. The underlying account, companion and history stay in the same DB.
Test Google login, search, a photo attachment, live camera capture, and microphone
recording/transcription. Grant device permissions when prompted. Check that saved
portraits/photos load. Photo interpretation still requires a selected vision model.

Browser media APIs require HTTPS or another secure context such as localhost.
Plain HTTP LAN/Tailscale IP addresses do not satisfy this requirement. Secure
context enables the permission flow; it does not override a denial or missing
camera/microphone hardware.

## Rollback

Use the backup directory printed by the configuration script. Copy its `.env`,
`backend/.env`, and `supabase/config.toml` back to their matching paths; retain
mode 0600. Rebuild with the restored client environment. Remove only our drop-in:

```bash
sudo rm /etc/systemd/system/lumen-web.service.d/50-static-export.conf
sudo systemctl daemon-reload
sudo tailscale serve --https=443 off
sudo tailscale serve --https=8444 off
sudo tailscale serve --https=8445 off
```

Restart Supabase to apply restored Auth configuration, then restart API/web.
The existing 8443 Google callback mapping is not removed.

## Checks and limits

Five isolated configuration tests cover preserved secrets/callbacks, redirects,
idempotence, input validation, and backup-file permissions. Static-server tests
cover SPA routes, asset types, HEAD, cache policy, private files, traversal,
symlink escape, and method rejection. Browser checks use the actual static server
and simulated camera hardware. Tailscale certificate provisioning, systemd setup,
real device permissions and remote TLS requests require verification on the host.

References:
- https://tailscale.com/docs/reference/tailscale-cli/serve
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
