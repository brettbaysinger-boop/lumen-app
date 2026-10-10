# Conversation timing benchmark

October 9, 2026 (America/Phoenix): user verified the image-subject fix at
205d6f7. Video's current Gemma model was reported as 8.4 GB, 100% GPU,
8192 context; RTX 5070 used 9639/12227 MiB at 91% utilization. These are
user-supplied snapshots, not a sustained benchmark or process attribution.

Run on Video while other users are not actively generating replies:

```bash
python3 scripts/benchmark-conversation.py --model satgeze/gemma4-12b-uncensored-1.5m:latest
```

The script runs three sequential synthetic direct-Ollama requests. It reads no
conversations, memories, credentials or app environment files. It does use GPU
resources and keeps the requested model resident for 15 minutes. No downloads,
explicit unloads, app routing changes, database writes or Helios requests occur.

Metrics: first visible content, first separately reported thinking chunk, wall
time, load time, prompt evaluation, generated tokens, generation time and tokens
per second. Thinking character counts are recorded, but the thinking text is not
printed or saved. Absence of a separate thinking field does not establish absence
of internal reasoning. Counts cannot be split into reasoning versus answer tokens
without provider support. Synthetic visible answers are printed for inspection.

Uses 8192 context, temperature 0.7, seed 42, 512 generated-token cap and default
model thinking settings. A length finish means truncation, not a completed quality
sample. Request timeout is 180 seconds of socket inactivity, not an overall
wall-clock deadline. Ctrl+C cancels this client if needed.

First run is current-state, not forced cold; repeats can benefit from prompt
caching. This isolates provider timing and does not reproduce the app's longer
memory-enriched prompt, image pipeline or speech latency. It is not a quality
ranking. A later comparison on Heavy must use the same installed model and
settings, account for GPU memory occupancy, and avoid simultaneous ComfyUI work.
Do not move workloads based on this single synthetic sample.

Validation: three offline parser tests cover timing conversion, thinking/visible
separation, incomplete streams and empty/truncated answers. Live measurements are
pending on the user's node. No application rebuild or restart is needed.

API field reference: https://docs.ollama.com/api/chat
