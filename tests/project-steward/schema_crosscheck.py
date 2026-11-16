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
CASES = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(
    os.environ.get("PS_TEST_OUT", os.path.join(os.environ.get("TMPDIR", "/tmp"), "project-steward-tests"))
) / "tests/project-steward/contract-cases.json"

# The TS validator is intentionally stricter than the schema on these cases.
STRICTER_THAN_SCHEMA: set[str] = set()


def main() -> int:
    schema = json.loads(SCHEMA.read_text())
    cls = jsonschema.Draft202012Validator
    cls.check_schema(schema)
    if "date-time" not in cls.FORMAT_CHECKER.checkers:
        print("NOT_RUN: date-time format checking unavailable; pip install rfc3339-validator")
        return 2
    validator = cls(schema, format_checker=cls.FORMAT_CHECKER)
    cases = json.loads(CASES.read_text())
    failures = 0
    for case in cases:
        errors = list(validator.iter_errors(case["data"]))
        schema_valid = not errors
        expected = case["valid"]
        if case["name"] in STRICTER_THAN_SCHEMA:
            expected = True
        ok = schema_valid == expected
        failures += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'}  {case['name']}  (schema says {'valid' if schema_valid else 'invalid'})")
    print(f"\n{len(cases) - failures}/{len(cases)} cases agree with python-jsonschema")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
