#!/usr/bin/env python3
"""Isolated still-image canary: one image through Lumen's own ComfyUI provider and workflow.

Runs ONE generation on the GPU (owner-approved step only) and writes the PNG to a local folder.
It does not touch Supabase, Chat, Gallery, the running lumen-api or any service. Run it from
the backend virtualenv on the machine that hosts lumen-api, against the private route to
ComfyUI (e.g. an SSH tunnel to Heavy's loopback 8188):

  backend/.venv/bin/python scripts/canary-comfyui-image.py --run-gpu \
      --url http://127.0.0.1:18188 --workflow backend/workflows/biglust-sdxl-v16-api.json \
      --checkpoint bigLust_v16.safetensors --out /tmp/lumen-canary
Prints a JSON summary: checkpoint (provenance), latency, size, PNG dimensions and sha256.
"""
import argparse
import asyncio
import hashlib
import json
import struct
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

PROMPT = "a lighthouse on a rocky coast at dusk, warm light in the window, photographic, detailed"


def png_size(data: bytes) -> tuple[int, int] | None:
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        return None
    return struct.unpack(">II", data[16:24])


async def run(args) -> int:
    from lumen.images import ComfyUIProvider
    settings = SimpleNamespace(comfyui_url=args.url, comfyui_workflow=args.workflow,
                               image_generation_timeout=args.timeout, comfyui_checkpoint=args.checkpoint,
                               comfyui_negative_prompt="lowres, bad anatomy, blurry, watermark, text, "
                                                       "child, minor, underage, teen, childlike body")
    provider = ComfyUIProvider(settings)
    if not await provider.health_check():
        print(json.dumps({"result": "FAIL", "reason": "ComfyUI not reachable at --url"}))
        return 1
    result = await provider.generate(args.prompt)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    path = out / "lumen-canary.png"
    path.write_bytes(result["bytes"])
    dims = png_size(result["bytes"])
    ok = result["mime_type"] == "image/png" and dims is not None and result["model"] == args.checkpoint
    print(json.dumps({"result": "PASS" if ok else "FAIL", "model": result["model"], "provider": result["provider"],
                      "latency_ms": result["latency_ms"], "bytes": len(result["bytes"]), "mime_type": result["mime_type"],
                      "png_size": dims, "sha256": hashlib.sha256(result["bytes"]).hexdigest(), "file": str(path)},
                     indent=2))
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run-gpu", action="store_true", help="required: confirms one GPU generation is intended")
    parser.add_argument("--url", required=True)
    parser.add_argument("--workflow", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--prompt", default=PROMPT)
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()
    if not args.run_gpu:
        print("Refusing: add --run-gpu to confirm one GPU generation (owner-approved canary only).")
        return 2
    return asyncio.run(run(args))


if __name__ == "__main__":
    sys.exit(main())
