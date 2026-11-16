# PS-05 — Owner GitHub portfolio mapping (source-backed, November 15, 2026)

**Status:** Source-only candidate; branch `fix/ps05-portfolio-repo-links-20261115`. This document does not assert runtime availability, release, or any current health.

**Method:** Independently list all 23 repositories accessible in the owner's GitHub account and inspect available README/source/PR metadata. A repository may contribute to several **distinct** projects. Repositories are source-code evidence, not deployment certificates. Every newly added repo link starts at a historical observation timestamp with no claimed commit SHA; the authenticated collector must fetch its actual HEAD before showing a current commit. Private-project database, media and infrastructure contents remain separate.

| Project | Linked repositories | Basis / boundary |
| --- | --- | --- |
| PestTrails | `pest-control-platform` | Active primary business software; Issue #6 remains an open security blocker. |
| Chorusfall | `chorusfall` | Dark-fantasy Godot RPG; current work is not inferred to be merged/deployed. |
| Raialume / Lumen | `raialume`, `lumen-app`, **`lumen-avatar-lab`**, **`lumen`** | Existing app + companion/avatar bridge sources; `lumen` is only a historical stub README, not the production app. |
| Brother Memory | **no standalone repo** | Privately installed ChatGPT RMC gateway and approved memory bank; no fake Git repository. |
| RMC | `raialume-memory-core` | RMC core; Lumen's pilot evidence is separately cited from `lumen-app` PR #10. |
| Forge | `forge`, **`forge-phase-b-r1`** | Core Forge repository and a *historical delivery-drop archive*, explicitly **not** another Forge checkout or production runtime. |
| Unified Local AI | **no dedicated repo** | On Lumen; status requires authorized host evidence rather than invented Git evidence. |
| DreamVault | **`private-companion` (shared)** | Private curated-media feature/application with DreamVault PRs (e.g. #95); independent product, not synonymous with the full Private Companion. |
| Wisdom of the Crowd | **no repo established** | Real council experiments, but no verified canonical standalone repository. |
| Brett's Games | **no repo established** | Independent Android game collection under local development; do not confuse with Raialume Android app. |
| Character Lab | `character-lab` | Owner placed on hold; presence of code does not imply reactivation. |
| Regent | `monarch-private` | Private Sure-based finance app; no claim of a new bank connection. |
| Bot Arenas | `bot-arenas`, **`buffett-bot-arena`**, **`sports-bot-arena`** | Unified arena and distinct earlier crypto/sports competition repos; no real betting authority implied. |
| Kalshi | `kalshi-arena`, `kalshi-bot-arena` | Separate Kalshi tracks; old/new versions should be distinguished in project details. |
| Pirates | `pirates-game` | Standalone commercial pirate game source. |
| Rattlesnake Exterminating | `rattlesnake-website` | Real business website/chat code; no invented appointment or prices. |
| Vaultwarden | **no repo established** | Pi installation; private backup status requires host evidence. |
| **Private Companion** | `private-companion` (shared) | Standalone local-first companion app (README explicitly states separate from Lumen); DreamVault may share development repo, not identity. |
| **FloraBot** | `FloraBot`, `florabot1` | Original placeholder plus plant-care assistant React/TypeScript app; unrelated to pest-control product. |
| **Model Weight Editing** | `model-weight-editing` | Independent research experiments/smoke tests; not the Forge coding agent. |
| **VoiceList** | `voicelist` | Independent phone/Whisper-to-project-notes application. |

**All 23 repo names are accounted for**, including archival/stub repositories. The test `test_all_23_owner_repositories_have_a_project_link` checks exact set coverage against `ALLOWED_REPOSITORIES`. A newly created repository requires deliberate registry review rather than silent classification.

### Collector correctness for multi-repo projects
- Previously last repo polled could overwrite the project's *latest commit* even when older. Now select chronologically newest UTC source commit.
- Previously a project could be marked `updated` with only a repo link and failed API reads. Now return `unavailable_no_verified_github_evidence` until a commit or actual PR-list check succeeds; keep older evidence historical.
- A checked empty PR list means **checked and none open**, not uncollected; a GitHub timeout or failed read never proves a repo has no open PRs.
- No host-receipt or `verified_current` claim is created by GitHub ingestion.

### Non-actions
No repo renaming or transfers; no GitHub permissions changed; no production deploy, branch merge, Lumen login changes, private media access, RMC operations, or host backup changes. The local Forge preview on port 18768 remains whatever the owner was inspecting; this PR does not change it.

### Validation
Run in the isolated Forge PS-04 checkout **after intentionally incorporating this branch into a fresh disposable test clone**:
```bash
PYTHONPATH=backend python -m pytest -q \
    backend/tests/test_project_steward_backend.py \
    backend/tests/test_project_steward_optional_insights.py \
    backend/tests/test_project_steward_registry_links.py
```
**Tests NOT YET RUN on Forge for this new branch.** Only earlier PS-04 tests on the previous pinned integration HEAD passed.
