# Provider visibility

This increment replaces placeholder infrastructure displays with backend configuration and records foreground provider requests on new replies. It is the visibility foundation for later explicit routing, not a new routing engine.

## Settings

AI providers lists conversation, photo understanding, memory extraction, image generation and speech routes. The authenticated endpoint `/v0.9/providers/companions/{id}` checks companion ownership. Hosts expose only hostname and port, never URL credentials, paths or query strings. Refresh failure removes stale rows and allows retry. Configuration is not a health check or a claim that a model is loaded.

## Reply records

Expand **Provider requests** on a new assistant reply to see text, vision, structured-output and image requests. Records persist in existing message metadata. Failed attempts and retries are distinct when the turn produces a saved reply. Older messages without records are not reconstructed. Actions needing no foreground inference display an empty-call explanation.

The record omits prompt contents, generated text and provider error bodies. It does not include background memory work or subsequent speech playback. A whole-turn failure without a saved assistant message has no persisted reply record. Image duration may include storage work. Multiple hosts indicate separate requests, not one model distributed across GPUs.

## Read-only hardware observation

From the repository on Video:

```bash
PYTHONPATH=backend backend/.venv/bin/python scripts/diagnose-providers.py --heavy-ollama http://192.168.86.50:11434 --samples 3
```

This reads Ollama loaded-model data and ComfyUI device statistics. It does not load/unload models, generate images or change Helios. GPU memory snapshots alone do not identify every consuming process.

## Verified baseline and deployment

The user verified companion-initiated images, Gallery persistence and natural companion prose at `0cde482`. The separate direct-image endpoint still had a canned success reply and now uses a short fallback. Existing FLUX.2 Klein workflow and model assignments are retained.

Local checks: 259 backend tests, TypeScript, clean web export, and a mocked mobile browser flow covering persisted records, configured routes, refresh errors and recovery. This is not live acceptance on the home nodes.

No migration or new dependency is required. Build with the existing HTTPS API and Supabase addresses, then restart API and web services. Run `python3 scripts/update-provider-checkpoint.py` to append the versioned checkpoint to the existing local project status and session handoff; it preserves their contents and skips already-recorded entries. Those local documentation changes must be explicitly committed when checkpointing. Configuration and backup files must not be included accidentally.

Acceptance: open Settings → AI providers; check hosts/models; send a normal message and expand Provider requests; request a companion image and confirm chat/Gallery, natural wording and image request details. Reload to confirm records remain. Speech infrastructure is unchanged.
