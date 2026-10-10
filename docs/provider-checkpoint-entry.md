<!-- provider-visibility-2026-10-10 -->
## October 10 — Provider visibility checkpoint

Implemented and locally verified; deployment and new-feature user acceptance pending.

- Settings now shows configured AI provider hosts and models instead of placeholder infrastructure badges.
- New assistant replies retain expandable provider request records: actual inference host, model, completion/failure and duration. Deterministic actions show no inference calls when appropriate.
- Records exclude prompts, credentials and response text. Background memory extraction and later speech playback are outside this per-reply record. Configured routes do not prove availability, GPU use or distributed inference.
- Direct image replies now use a short natural fallback; companion-authored image explanations remain preserved.
- Existing routing, models, workflows, speech infrastructure and database schema are unchanged.
- Local verification: 259 backend tests, TypeScript check, clean web export and mobile-sized mocked browser coverage. Live acceptance remains separate.
- User verified the prior companion-image prose change at `0cde482`, with images appearing in conversation and Gallery. Direct image requests still used the old canned sentence; this increment addresses that separate path.
- User-supplied home-LAN evidence: Video RTX 5070 12 GB; Heavy ComfyUI RTX 5060 Ti 16 GB, about 3.13 GiB free at the sampled moment; Heavy Ollama had no loaded models. API health reported Ollama/database OK. Heavy SSH refused connections while its HTTP providers responded. These are snapshots, not ongoing health guarantees.

See `docs/provider-visibility.md` (or `provider-visibility.md` from this directory). Next: deploy, check Settings and a fresh text-plus-image reply, then use observed routing to choose the next bounded milestone. Explicit multi-provider selection/scheduling is not implemented in this increment.
