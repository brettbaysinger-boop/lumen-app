# Search, page excerpts, and cited answers

The explicit `Search the web: QUERY` command now searches local SearXNG, attempts
to read up to three public result pages, and asks the selected conversation model
to answer using those excerpts and search snippets. The globe button still prepares
the command as a draft; Send is required. The authenticated raw `/v0.5/web/.../search`
endpoint continues to return search results only. Chat performs synthesis.

## Experience

Try `Search the web: compare three skillet ribeye recipes and explain their
differences`. The answer includes numbered references such as `[1]`, clickable
inline and in the source cards. Grouped references such as `[1, 2]` are checked
member by member and normalized to `[1] [2]`; historical grouped references also
render as individual source links. Each card distinguishes **Page excerpt read**
from **Search snippet**. The reply states how many page excerpts were read.
Source cards, retrieval status/time, and the answer survive conversation reload.
Page bodies and excerpts are not stored in message metadata.

The answer is generated in a separate local model turn containing only the
explicit search question and references. It does not include account tokens,
personal memories, or earlier private chat. Retrieved text has no tool access.
The answer is buffered until source-number checks finish; users see activity
updates during retrieval/generation rather than unvalidated streamed text.

## Boundaries

| Limit | Value |
| --- | --- |
| Search query | 2–500 characters |
| Returned source cards | Up to 6 |
| Pages attempted | First 3 results, concurrently |
| Redirects | Up to 3 per page; each target revalidated |
| Download size | 512 KiB per page |
| Extracted page text | First 4,000 characters per page |
| Page deadline | 15 seconds plus 2 seconds async allowance |
| Supported content | Plain text or HTML; no script execution |

This reads **excerpts**, not entire websites or necessarily every part of a page.
The extractor removes script/style, navigation, headers/footers, forms, and other
non-body elements. Relevant material may be beyond the excerpt, omitted by the
extractor, or require JavaScript. Paywalls, robot challenges, HTTP errors, oversized
pages, compressed responses despite requesting identity encoding, PDFs and other
downloads fall back to the search snippet. A slow OS DNS lookup can outlive the
async wait in its bounded worker thread; no unchecked connection is made.

Blocked/unreadable pages are labeled as snippets, never as successful reads.
Failed generation, empty answers, missing/invalid numbered citations, or invented
HTTP URLs produce a useful snippet fallback. Citation checks establish that cited
numbers exist; they do **not** verify the truth of each claim or prove its support
in a source. The prompt requests factual grounding, uncertainty, and comparisons
based on actual references. Users should inspect sources for consequential claims.

Each page GET uses only Host, User-Agent, Accept and Accept-Encoding headers.
No login cookies, Supabase credentials, authorization tokens, chat history or
private memories are sent to websites. Search queries still go through configured
SearXNG upstream engines, and page hosts see requests from the user's server.
No downloads, account actions or private tools are available to the synthesis turn.
Instructions in source text are untrusted data. Prompt separation reduces exposure
but cannot guarantee resistance to every model prompt-injection attempt.

## Network safeguards

The reader allows only public HTTP(S) URLs on ports 80/443. Localhost, LAN,
link-local, Tailscale, special-use IPs, credentials-in-URLs and non-web schemes
are blocked. All returned DNS addresses must be public. The socket connects to
a validated literal address rather than resolving the name again; HTTPS verifies
the certificate against the original DNS hostname using the system trust store.
Redirects are followed manually with a fresh check, and HTTPS-to-HTTP downgrades
are blocked. Proxy environment variables are not used for these page connections.

The first validated address is used; there is no alternative-address retry yet.
This may cause snippet fallback on some reachable sites. A public endpoint that
exposes internal resources remains public from the reader's viewpoint: these
checks protect network destinations, not arbitrary remote application behavior.

## Deploy and verify

Fetch/merge the checkpoint bundle, then:

```bash
cd ~/lumen-push &&
npm run typecheck &&
npm run build:web &&
sudo systemctl restart lumen-api.service lumen-web.service
```

No additional package, migration, Auth setting, or HTTPS mapping is required.
The previously configured SearXNG service must be running. Test a research question
through the globe button and inspect inline citations and source-read labels.

For public search/page diagnostics:

```bash
cd ~/lumen-push/backend
PYTHONPATH=. .venv/bin/python ../scripts/diagnose-web-research.py
```

Backend tests cover DNS/private-address rejection, literal-IP connection and TLS
hostname verification, redirects, URL/type/size restrictions, text extraction,
retrieval fallback, page limits, synthesis input isolation, valid source numbers
and invalid-answer fallback. Browser checks use mocked services to verify inline
citations, read/snippet labels, reload persistence, mobile controls, and logout.
Live page availability, model accuracy, and performance need host verification.

References:
- https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- https://docs.python.org/3/library/http.client.html
