"""Independent check: validate the shared contract cases with a real JSON-schema
implementation (python-jsonschema, Draft 2020-12, format checking on) and confirm it
agrees with the hand-written TypeScript validator's expected verdicts.

Run after run-unit.sh (which writes contract-cases.json):
    python3 tests/project-steward/schema_crosscheck.py

Requires `pip install jsonschema rfc3339-validator` (not an app dependency).
"""
import json
import os
import pathlib
import sys

import jsonschema

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "contracts/project-steward/project-snapshot.v1.schema.json"
SCHEMA_V11 = ROOT / "lib/project-steward/proposed/project-snapshot.v1.1.schema.json"
CASES = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(
    os.environ.get("PS_TEST_OUT", os.path.join(os.environ.get("TMPDIR", "/tmp"), "project-steward-tests"))
) / "tests/project-steward/contract-cases.json"

def run(schema_path: pathlib.Path, cases_path: pathlib.Path, label: str) -> int:
    schema = json.loads(schema_path.read_text())
    cls = jsonschema.Draft202012Validator
    cls.check_schema(schema)
    validator = cls(schema, format_checker=cls.FORMAT_CHECKER)
    cases = json.loads(cases_path.read_text())
    failures = 0
    for case in cases:
        schema_valid = not list(validator.iter_errors(case["data"]))
        ok = schema_valid == case["valid"]
        failures += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'}  {case['name']}  (schema says {'valid' if schema_valid else 'invalid'})")
    print(f"{len(cases) - failures}/{len(cases)} {label} cases agree with python-jsonschema\n")
    return failures


def main() -> int:
    if "date-time" not in jsonschema.Draft202012Validator.FORMAT_CHECKER.checkers:
        print("NOT_RUN: date-time format checking unavailable; pip install rfc3339-validator")
        return 2
    failures = run(SCHEMA, CASES, "v1.0 (approved contract)")
    failures += run(SCHEMA_V11, CASES.with_name("contract-cases-v11.json"), "v1.1 (proposed)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
