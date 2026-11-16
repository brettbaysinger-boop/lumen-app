# Project Steward UI tests (PS-01)

Isolated tests for `app/project-steward/**`, `components/project-steward/**` and
`lib/project-steward/**`. Nothing here touches shared app files, services or the network
(the browser test intercepts its only API URL).

## 1. Unit tests (pure logic: validator, client states, filters, freshness, fixture rules)

```sh
bash tests/project-steward/run-unit.sh
```

Compiles with `tsc` to `$TMPDIR/project-steward-tests` and runs `node --test`.

## 2. Independent schema cross-check

Validates the same contract cases with python-jsonschema (Draft 2020-12, date-time
format on) against `contracts/project-steward/project-snapshot.v1.schema.json`, and the
v1.1 cases against the proposal in `lib/project-steward/proposed/`.

```sh
pip install jsonschema rfc3339-validator   # tooling only, not an app dependency
python3 tests/project-steward/schema_crosscheck.py   # after run-unit.sh
```

Exits 2 (NOT_RUN) if date-time format checking is unavailable.

## 3. Browser acceptance + screenshots (web export + Playwright)

Two web builds are needed. Use `--clear`: Metro caches inlined `EXPO_PUBLIC_*` values
between exports otherwise.

```sh
export EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=test
npx expo export --clear --platform web --output-dir /tmp/ps-nolive
EXPO_PUBLIC_PROJECT_STEWARD_SNAPSHOT_URL=http://127.0.0.1:8765/project-steward/snapshot \
  npx expo export --clear --platform web --output-dir /tmp/ps-live
DIST_NOLIVE=/tmp/ps-nolive DIST_LIVE=/tmp/ps-live node tests/project-steward/browser.cjs
```

Optional: `PS02_FIXTURE=path/to/valid_snapshot.json` (from the PS-02 branch,
`docs/project-steward/fixtures/`) also serves the backend's own offline fixture as the API
response. Without it that one check prints NOT_RUN.

The Supabase values are dummies so the shared app bundle loads; no request reaches them
on the Projects route. Screenshots land in `tests/project-steward/screenshots/`.
The clock is pinned to 2026-11-16T02:00Z so ages and STALE marks are reproducible.

## Previewing locally

`npx expo start --web`, then open `/project-steward` (demo) or
`/project-steward?source=live`. The route is not linked from the tab bar on purpose.
