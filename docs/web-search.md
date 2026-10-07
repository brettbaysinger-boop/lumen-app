# Local web search checkpoint

Lumen can search the web through a local SearXNG instance on an explicit request.
Use the globe button to prepare a search draft, or type:

- `Search the web: quick vegetarian dinner recipes`
- `Search the internet for beginner 3D printer calibration models`

The button does not submit anything until Send. Only the explicit query goes to
SearXNG. User tokens, companion identity, memory records, and chat history are
not included. SearXNG forwards searches to external engines; this is not offline
search. Its configured providers receive search terms. Sources and queries are
saved in the user's existing owner-scoped conversation.

This first release returns up to six title/snippet/link results, with clickable
source cards. It does not read full articles, summarize retrieved pages with an
LLM, download files, execute STL/CAD assets, or identify photos. Partial-engine
failures are indicated. Snippets may be incomplete or inaccurate; linked pages
remain untrusted external content. The source service supplies rankings; Lumen
does not establish authority from ranking alone. Camera vision is the next
separate capability.

## Install

From the clean working branch at the restricted-support checkpoint, import
`lumen-web-search.bundle`, then run:

```bash
cd ~/lumen-push
npm run typecheck
python3 scripts/configure-web-search.py
docker compose --env-file infra/search/.env -p lumen-search -f infra/search/compose.yaml up -d
npm run build:web
sudo systemctl restart lumen-api.service lumen-web.service
```

The setup script retains any existing search secret, generates one if absent,
and sets only `WEB_SEARCH_URL=http://127.0.0.1:8888` in backend configuration.
OAuth, CORS, account support, and model settings are preserved. The search secret
is kept in the ignored `infra/search/.env`. No new Python packages or database
migrations are needed. The Docker service restarts unless stopped, binds only
to loopback, and enables JSON output; browsers use Lumen's authenticated API.
The Docker image uses the upstream `latest` tag. Record its deployed digest if
you need a pinned release. Docker could not be run in the development workspace;
its real startup and outbound search behavior must be checked on the host.

Test the local engine without printing credentials:

```bash
curl --max-time 40 -fsS --get http://127.0.0.1:8888/search \
  --data-urlencode 'q=vegetarian dinner recipes' --data 'format=json' \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Results:", len(d.get("results",[]))); print("Engine failures:", len(d.get("unresponsive_engines",[])))'
```

If startup fails, inspect:

```bash
docker compose --env-file infra/search/.env -p lumen-search -f infra/search/compose.yaml logs --tail=80 search
```

SearXNG JSON API and container configuration references:
https://docs.searxng.org/dev/search_api.html
https://docs.searxng.org/admin/installation-docker

## Expired-session logout

Browser Sign out now uses device-local logout, stops automatic refresh, and
clears this app's token/user/PKCE keys even if the Auth request fails or stalls.
It navigates to `/login` and retains appearance preferences and database data.
It does not promise server-side token revocation while the server is unavailable;
other devices' sessions remain signed in. Settings and account-setup failure
screens both use this helper. Native keeps SDK local sign-out.

## Validation

- 114 backend tests: explicit command recognition, companion ownership,
  input limits, upstream request contents, source projection, error behavior,
  chat source persistence, and suppression of memory extraction for search turns.
- Browser sign-out lifecycle: healthy, invalid session, offline, and stalled
  requests clear only the configured Auth keys.
- Exported browser fixture: explicit search draft, persisted source link cards,
  mobile composer bounds, and logout despite Auth server failure.
- Typechecking and Expo web export passed.

Browser tests use mocked services, not live LAN/Auth/SearXNG. Run
`scripts/test-web-search-browser.cjs` with Playwright or set
`LUMEN_PLAYWRIGHT_MODULE` to its installed module path. Unit logout test:
`node scripts/test-sign-out.cjs`.
