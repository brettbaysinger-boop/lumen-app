# Proposed Project Snapshot v1.1 (NOT approved)

Proposal from the UI lane (PS-01, PR #32) for the coordinator and PS-02. The approved
contract is still `contracts/project-steward/project-snapshot.v1.schema.json`; this folder
does not replace it. Machine-readable form: `project-snapshot.v1.1.schema.json` here.
The UI already reads both `"1.0"` and `"1.1"`.

## What changes from v1.0

| Where | Field | Type | Meaning |
| --- | --- | --- | --- |
| top level | `version` | `"1.1"` | |
| top level | `stale_after_seconds` | integer 3600..2592000, optional | The backend's staleness window. The UI uses it for every STALE mark. Omitted: UI default 72 h (same as PS-02's `stale_threshold_hours` default). |
| project | `insights` | object, optional | Omitted = nothing collected for this project. |

Everything else in v1.0 is unchanged.

## `insights` (all keys required once the object is present)

`null` always means "not collected / unknown". An empty array means "checked, none".

| Field | Type | Source the backend needs |
| --- | --- | --- |
| `observed_at` | date-time | when the insights were gathered |
| `open_prs` | `null` or `{observed_at, items[]}` | GitHub `GET /repos/{o}/{r}/pulls?state=open` |
| `open_prs.items[].ref` | `owner/repo#n` or https URL | PR number / `html_url` |
| `open_prs.items[].title` | string ≤300 | `title` |
| `open_prs.items[].review` | `draft` \| `review_required` \| `changes_requested` \| `approved` | `draft` flag, else latest reviews (`GET .../pulls/{n}/reviews`) |
| `open_prs.items[].opened_at`, `updated_at` | date-time | `created_at`, `updated_at` |
| `open_prs.items[].head_sha` | sha or null | `head.sha` |
| `last_commit` | `null` or `{at, ref, commit_sha, branch, observed_at}` | `GET /repos/{o}/{r}/commits/{default_branch}` |
| `last_deploy` | `null` or `{at, ref, commit_sha, target, observed_at}` | **host receipt only.** Never from a merge, tag, CI run or GitHub "deployment" without a verified receipt. `null` = none recorded. |
| `ci` | `null` or `{state, branch, run_ref, commit_sha, observed_at}` | check-runs / combined status of the default branch head |
| `ci.state` | `passing` \| `failing` \| `pending` \| `none` \| `unknown` | `none` = checked and no runs exist (different from `null`) |
| `next[]` | `{kind, text ≤240, ref}` | `kind`: `owner_decision` \| `milestone`. From the owner-approved registry, not inferred. |
| `activity[]` | `{at, kind, text ≤240, ref}` | `kind`: `commit` \| `pr` \| `issue` \| `ci` \| `deploy` \| `decision` \| `note`. Newest ~10. |
| `links[]` | `{kind, label ≤60, url}` | `kind`: `repo` \| `live` \| `issues` \| `docs`. `url` must be https. |

## Rules the UI enforces on any payload (v1.0 or v1.1)

- Whole snapshot is rejected (shown as "failed contract validation") on any violation,
  unknown key, bad enum or bad timestamp. Nothing partial is displayed.
- Only `https://` URLs with a real host and no embedded credentials are ever opened.
  `owner/repo#n` refs are turned into github.com links; anything else is plain text.
- Control, zero-width and bidi-override characters are stripped from every string.
- `insights` absent, or a group `null`: the UI says "not collected" / "unknown".
  A v1.0 snapshot: the UI says the source does not provide this data.
- Demo fixture data is only shown in demo mode and always carries the DEMO banner.

## Open questions for the coordinator / PS-02

1. Endpoint and auth: UI does `GET` on one configured URL (PS-02 serves
   `/v0.1/project-steward/snapshot`) and can send `Authorization: Bearer …` through the
   `getAuthorization` hook, but which token the app should send is not defined. Not wired.
2. Stale handling is done on both sides today: PS-02 rewrites stale projects (prefixes the
   summary with `[STALE]`, appends a blocker, downgrades evidence). The UI shows that as
   delivered and also marks STALE itself. Suggest the backend stops rewriting text and
   sends `stale_after_seconds`, so a stale project is not also counted as "blocked".
3. v1.0 has `deployment: not_deployed` vs `unknown`. The UI treats them differently
   (proved vs no evidence). PS-02 should only send `not_deployed` when that is known.
