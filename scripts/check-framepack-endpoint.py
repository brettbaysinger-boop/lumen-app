#!/usr/bin/env python3
"""Read-only check of a FramePack (Gradio) server before Lumen uses it for image-to-video.

Nothing is uploaded or queued. It reports whether the URL answers, which Gradio API prefix it
uses, every named endpoint, and the inputs (label, name, default) of the endpoint Lumen would
call, so the label mapping in backend/lumen/video_providers.py can be checked against the real
install. Run it on Heavy against whichever FramePack install is actually operational:

  python3 scripts/check-framepack-endpoint.py --url http://127.0.0.1:<port> [--api-name /process]
Exit status 0 only when the endpoint exists and Lumen can fill its inputs.
"""
import argparse
import json
import sys
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))


def get(url: str):
    with urlopen(url, timeout=10) as response:  # noqa: S310 - operator-supplied local URL
        return json.load(response)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", required=True)
    parser.add_argument("--api-name", default="/process")
    parser.add_argument("--dump", help="write every endpoint's inputs and returns to this JSON file "
                                       "(for designing an adapter; contains no secrets)")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    info, prefix = None, None
    for candidate in ("/gradio_api", ""):
        try:
            info = get(f"{base}{candidate}/info")
            prefix = candidate
            break
        except (URLError, OSError, ValueError):
            continue
    if info is None:
        print("FramePack/Gradio: UNREACHABLE or not a Gradio app")
        return 1
    print(f"Gradio API: reachable, prefix '{prefix or '(none)'}'")
    endpoints = info.get("named_endpoints") or {}
    print("Named endpoints:", ", ".join(sorted(endpoints)) or "(none)")
    if args.dump:
        with open(args.dump, "w", encoding="utf-8") as handle:
            json.dump({"prefix": prefix, "named_endpoints": endpoints,
                       "unnamed_endpoints": info.get("unnamed_endpoints") or {}}, handle, indent=2, default=str)
        print(f"Wrote full endpoint metadata to {args.dump}")
    endpoint = endpoints.get(args.api_name)
    if not isinstance(endpoint, dict):
        print(f"Endpoint {args.api_name}: MISSING (set FRAMEPACK_API_NAME to one listed above)")
        return 1
    parameters = endpoint.get("parameters") or []
    for p in parameters:
        default = p.get("parameter_default") if p.get("parameter_has_default") else "(required)"
        print(f"  input: label={p.get('label')!r} name={p.get('parameter_name')!r} "
              f"component={p.get('component')!r} default={default!r}")
    try:
        from lumen.video_providers import framepack_arguments
        image = {"path": "check", "meta": {"_type": "gradio.FileData"}}
        framepack_arguments(parameters, image=image, prompt="check", negative="", seed=1, seconds=3.0)
        print("Lumen input mapping: OK")
    except Exception as exc:  # report, never guess
        print(f"Lumen input mapping: FAILS ({exc})")
        return 1
    print("RESULT: READY (endpoint and inputs only; no video was generated)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
