<!-- provider-acceptance-image-subject-2026-10-09 -->
## October 9 (America/Phoenix) — Live provider acceptance and image-subject fix

Provider visibility at `db21282` is deployed and user-verified. The user reported
Settings destinations correct and supplied persisted reply request details:
- Direct image: Heavy ComfyUI at `192.168.86.50:8188`, completed in 3.06 seconds.
- Companion-chosen scene: Video Ollama at `127.0.0.1:11434`, selected Gemma model,
  completed in 26.16 seconds; Heavy image generation completed in 3.10 seconds.
- Helios remains configured at `100.121.251.39:8000`; no speech changes.

Heavy also has Tailscale access. No routing change was needed: Video continues
to call Heavy over the home LAN while clients can reach Video through Tailscale.
The request records show separate calls, not distributed model inference.

A newly observed issue was fixed: merely addressing “Lumen” in a landscape
request previously injected her visual identity. Named subjects now require
an explicit depiction relationship such as “of Lumen”, “paint Lumen” or
“featuring Lumen”. Existing “yourself”, “of you” and “with you” references remain.
Ordinary scenery requests retain their original prompt and generic reply;
explicit companion portraits retain identity conditioning. This is a bounded
rule fix, not comprehensive natural-language subject parsing.

Verification: 25 targeted backend tests passed across image identity, direct
image endpoints, companion images and companion-image runtime. No frontend,
dependency, database, workflow or infrastructure change. This subject fix is
locally tested; deployment and live acceptance remain pending. Next acceptance:
address Lumen while requesting scenery, then explicitly request her portrait;
confirm both images and Gallery persistence. Generated content remains subject
to the image model; the regression checks verify identity prompt injection.
