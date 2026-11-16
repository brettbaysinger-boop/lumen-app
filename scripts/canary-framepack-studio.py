#!/usr/bin/env python3
"""Isolated FramePack-Studio canary: ONE short image-to-video job through Lumen's own adapter.

Owner-approved step only. It checks the adapter contract first (read-only), refuses if
FramePack-Studio is already running a job, then queues exactly one "Original" image-to-video job
from a still you supply (for example the BigLust canary PNG), follows only that job by its id and
writes the MP4 locally. It never calls end_process, clear or cancel endpoints, and it does not
touch Supabase, Chat, Gallery, lumen-api or any service setting. Video stays off in Lumen.

  python scripts/canary-framepack-studio.py --run-gpu --url http://127.0.0.1:7863 \
      --image /tmp/lumen-canary/lumen-canary.png --seconds 3 --out /tmp/lumen-fps-canary \
      [--comfy-url http://127.0.0.1:<comfy port>]   # release ComfyUI's VRAM first

Needs a Python with httpx and pydantic-settings (the lumen backend virtualenv has both).
Prints a JSON summary: FP-Studio job id, latency, size, sha256 and the file written.
"""
import argparse
import asyncio
import hashlib
import json
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

PROMPT = "gentle camera push-in, waves rolling against the rocks, the lighthouse light slowly turning"


async def run(args) -> int:
    from lumen.video_providers import FramePackStudioProvider, free_comfy_memory
    settings = SimpleNamespace(framepack_url=args.url, framepack_api_name="/handle_start_button",
                               video_generation_timeout=args.timeout)
    provider = FramePackStudioProvider(settings)
    if not await provider.health_check():
        print(json.dumps({"result": "FAIL", "reason": "FramePack-Studio unreachable or its API is not the "
                                                      "contract this adapter was written for; run "
                                                      "check-framepack-endpoint.py --api-name /handle_start_button"}))
        return 1
    if args.comfy_url:
        # Same step Lumen's video jobs take: ComfyUI unloads its models (BigLust) so FramePack has the
        # 16 GB GPU. Nothing is deleted; the next image request loads the checkpoint again.
        await free_comfy_memory(args.comfy_url)
    image = Path(args.image).read_bytes()
    mime = "image/png" if image[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"

    async def progress(percent, stage):
        print(f"progress {percent}% {stage}", file=sys.stderr)

    result = await provider.generate(image, mime, args.prompt, seconds=args.seconds,
                                     negative=args.negative, on_progress=progress)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    path = out / "lumen-fps-canary.mp4"
    path.write_bytes(result["bytes"])
    ok = result["bytes"][4:8] == b"ftyp"
    print(json.dumps({"result": "PASS" if ok else "FAIL", "provider": result["provider"], "model": result["model"],
                      "fp_studio_job_id": result.get("job_id"), "latency_ms": result["latency_ms"],
                      "bytes": len(result["bytes"]), "sha256": hashlib.sha256(result["bytes"]).hexdigest(),
                      "file": str(path)}, indent=2))
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run-gpu", action="store_true", help="required: confirms one GPU job is intended")
    parser.add_argument("--url", required=True, help="FramePack-Studio base URL, e.g. http://127.0.0.1:7863")
    parser.add_argument("--image", required=True, help="start frame (PNG or JPEG), e.g. the BigLust canary PNG")
    parser.add_argument("--seconds", type=float, default=3.0)
    parser.add_argument("--out", required=True)
    parser.add_argument("--prompt", default=PROMPT)
    parser.add_argument("--negative", default="")
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--comfy-url", default="", help="ComfyUI URL to release VRAM first (as Lumen's video jobs do)")
    args = parser.parse_args()
    if not args.run_gpu:
        print("Refusing: add --run-gpu to confirm one GPU job (owner-approved canary only).")
        return 2
    if not 1.0 <= args.seconds <= 5.0:
        print("Refusing: the first canary is 1 to 5 seconds.")
        return 2
    return asyncio.run(run(args))


if __name__ == "__main__":
    sys.exit(main())
