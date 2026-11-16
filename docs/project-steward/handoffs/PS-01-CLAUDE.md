# PS-01 — Claude: fast isolated Projects UI
Primary authority: Issue #28. Coordination: Issue #27 / Draft PR #31.
**This branch is an assignment intake only. UI implementation has NOT started.**

Goal: build usable Projects home and project detail route in the current Raialume Expo Router app. Use `contracts/project-steward/project-snapshot.v1.schema.json`. Keep a visually coherent app style.

Only edit:
- `app/project-steward/**` (standalone route, no shared tab registration)
- `components/project-steward/**`
- `lib/project-steward/**`
- isolated tests for those paths.

Minimum first proof: real route rendered from *explicitly marked demo fixtures*; project cards and full detail; blockers; distinct development/deployment state; source link/time badges; phone-width and desktop acceptance, search, no fake deployment claims.

DO NOT edit `app/(tabs)/_layout.tsx`, `app/(tabs)/memories.tsx`, chat screens, Live Room, RMC adapter or service configs. Do not merge or deploy. Read the parent issue and coordination contract before coding.

Deliver one draft PR into `feat/project-steward-coordination-20261115`, include exact SHA, tests actually executed (PASS/SKIP), limitations, and screenshots. Do not claim live API data from fixtures. Target first candidate 1–3 working days, estimate conditional on availability.
