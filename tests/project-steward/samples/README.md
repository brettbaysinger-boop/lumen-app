# Backend-produced samples (test input only)

`ps02-proposed_snapshot_v1.1.json` is an unmodified copy of
`docs/project-steward/fixtures/proposed_snapshot_v1.1.json` from the PS-02 backend branch
`feat/ps02-gemini-project-data-20261115` at commit `2ac269224a8247092c788a0d55bbc8b8afd6fdc0`.
Its content is PS-02's synthetic fixture data, not real project status. It is never shown
by the app; tests use it to prove the UI validator against a backend-shaped payload.

At that commit the file still carries `freshness_policy_hours`, which the coordinator's
canonical v1.1 (issue #41) replaces with `stale_after_seconds`. The tests therefore check
both: as-is is rejected for exactly that one key, and the canonical form is accepted.
