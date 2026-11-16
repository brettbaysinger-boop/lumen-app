#!/usr/bin/env python3
"""Read-only check of the still-image workflow against a ComfyUI server (e.g. on Heavy).

No prompt is queued, no model is loaded and nothing is written. It answers:
  * is ComfyUI reachable, and which version / GPU does it report;
  * which checkpoints ComfyUI lists (and which look like BigLust);
  * does the configured checkpoint exist exactly as named;
  * are all node types used by the workflow installed;
  * which {{LUMEN_*}} placeholders the workflow uses.

  python3 scripts/check-comfyui-image-workflow.py --url http://127.0.0.1:8188 \
      --workflow backend/workflows/biglust-sdxl-v16-api.json --checkpoint '<exact filename>'
Exit status 0 only when everything needed is present.
"""
import argparse
import json
import re
import sys
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import urlopen


def get(url: str):
    with urlopen(url, timeout=10) as response:  # noqa: S310 - operator-supplied local URL
        return json.load(response)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", required=True)
    parser.add_argument("--workflow", required=True)
    parser.add_argument("--checkpoint", default="")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    ok = True
    try:
        stats = get(f"{base}/system_stats")
    except (URLError, OSError, ValueError) as exc:
        print(f"ComfyUI: UNREACHABLE ({type(exc).__name__})")
        return 1
    system = stats.get("system", {})
    print("ComfyUI: reachable, version", system.get("comfyui_version", "unknown"))
    for device in stats.get("devices", []):
        print(f"  GPU: {device.get('name')} vram_total={device.get('vram_total')} vram_free={device.get('vram_free')}")

    loader = get(f"{base}/object_info/CheckpointLoaderSimple").get("CheckpointLoaderSimple", {})
    choices = (((loader.get("input") or {}).get("required") or {}).get("ckpt_name") or [[]])[0]
    choices = choices if isinstance(choices, list) else []
    print(f"Checkpoints listed: {len(choices)}")
    for name in choices:
        if re.search(r"big\s*_?-?\s*lust", name, re.IGNORECASE):
            print(f"  BigLust candidate: {name}")
    if args.checkpoint:
        found = args.checkpoint in choices
        print(f"Configured checkpoint {args.checkpoint!r}: {'PRESENT' if found else 'MISSING'}")
        ok &= found
    else:
        print("Configured checkpoint: not given (set COMFYUI_CHECKPOINT to one exact name above)")
        ok = False

    with open(args.workflow, encoding="utf-8") as handle:
        text = handle.read()
    workflow = json.loads(text)
    placeholders = sorted(set(re.findall(r"\{\{LUMEN_[A-Z_]+\}\}", text)))
    print("Placeholders:", ", ".join(placeholders) or "none")
    if "{{LUMEN_PROMPT}}" not in placeholders:
        print("  MISSING {{LUMEN_PROMPT}}")
        ok = False
    for class_type in sorted({node.get("class_type") for node in workflow.values() if isinstance(node, dict)}):
        try:
            present = class_type in get(f"{base}/object_info/{quote(class_type)}")
        except (URLError, OSError, ValueError):
            present = False
        print(f"Node {class_type}: {'installed' if present else 'MISSING'}")
        ok &= present
    print("RESULT:", "READY" if ok else "NOT READY")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
