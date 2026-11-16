#!/usr/bin/env python3
"""Read-only: show (and optionally copy) the video FramePack-Studio recorded for ONE queue job.

Run it on Heavy, in FP-Studio's folder. It reads FP-Studio's own job -> output record (queue.json,
entry <job id>, field "result", written by its queue from that job's own output stream). It never
lists the outputs folder to guess, and never touches FP-Studio, its queue or the GPU.

  python3 scripts/framepack-studio-job-output.py --queue-json queue.json --job-id <uuid from the canary>
  python3 scripts/framepack-studio-job-output.py --queue-json queue.json --job-id <uuid> --copy-to /tmp/lumen-fps-canary

It refuses unless: the entry exists and is "completed" with no error; its result is an MP4 named the
way FP-Studio's worker names outputs (<yymmdd_HHMMSS_mmm_rand>_<frames>.mp4) inside the outputs
folder; the file exists and starts like an MP4; and it was written while the job ran (between
started_at and completed_at, 120 s slack). --copy-to writes only lumen-fps-canary.mp4 in that folder.
Stdlib only. Prints one JSON line.
"""
import argparse
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

OUTPUT_NAME = re.compile(r"^\d{6}_\d{6}_\d{3}_\d{1,4}_\d+\.mp4$")
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
SLACK = 120


def check(queue_json: Path, job_id: str, outputs: Path | None) -> dict:
    if not UUID.match(job_id):
        raise ValueError("job id must be the FP-Studio queue uuid printed by the canary")
    entries = json.loads(queue_json.read_text())
    entry = entries.get(job_id) if isinstance(entries, dict) else None
    if not isinstance(entry, dict):
        raise ValueError(f"job {job_id} is not in {queue_json.name}")
    status, error, result = entry.get("status"), entry.get("error"), entry.get("result")
    if status != "completed" or error:
        raise ValueError(f"job {job_id} is {status!r} (error: {error!r}), not a clean completion")
    if not isinstance(result, str) or not result:
        raise ValueError(f"job {job_id} has no result file recorded")
    path = Path(result)
    if not path.is_absolute():
        path = queue_json.parent / path
    path = path.resolve()
    outputs = (outputs or queue_json.parent / "outputs").resolve()
    if path.parent != outputs:
        raise ValueError(f"result is not directly in {outputs}: {path}")
    if not OUTPUT_NAME.match(path.name):
        raise ValueError(f"result is not an FP-Studio output name: {path.name}")
    if not path.is_file():
        raise ValueError(f"result file is missing: {path}")
    data = path.read_bytes()
    if data[4:8] != b"ftyp":
        raise ValueError(f"result is not an MP4: {path.name}")
    mtime = path.stat().st_mtime
    started, completed = entry.get("started_at"), entry.get("completed_at")
    if not isinstance(started, (int, float)) or not isinstance(completed, (int, float)):
        raise ValueError("queue entry has no started_at/completed_at to correlate with")
    if not started - SLACK <= mtime <= completed + SLACK:
        raise ValueError(f"{path.name} was written outside job {job_id}'s run window")
    # FP-Studio's own saved job properties, to compare with the canary (3 s, its prompt and seed).
    saved = {key: entry.get(key) for key in ("model_type", "generation_type", "prompt", "seed",
                                              "total_second_length", "input_image_path", "created_at",
                                              "started_at", "completed_at") if key in entry}
    return {"job_id": job_id, "status": status, "job": saved, "file": str(path), "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), "written_s_after_start": round(mtime - started, 1),
            "run_s": round(completed - started, 1)}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--queue-json", required=True, type=Path)
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--outputs", type=Path, help="FP-Studio outputs folder (default: next to queue.json)")
    parser.add_argument("--copy-to", type=Path, help="copy the verified file here as lumen-fps-canary.mp4")
    args = parser.parse_args(argv)
    try:
        summary = check(args.queue_json, args.job_id.strip(), args.outputs)
    except (OSError, ValueError) as exc:
        print(json.dumps({"result": "REFUSED", "reason": str(exc)}))
        return 1
    if args.copy_to:
        args.copy_to.mkdir(parents=True, exist_ok=True)
        target = args.copy_to / "lumen-fps-canary.mp4"
        shutil.copyfile(summary["file"], target)
        summary["copied_to"] = str(target)
    print(json.dumps({"result": "MATCH", **summary}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
