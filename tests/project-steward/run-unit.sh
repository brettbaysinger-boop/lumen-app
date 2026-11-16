#!/usr/bin/env bash
# Unit tests for the pure Project Steward UI logic (no React Native, no network).
# Usage (from anywhere): bash tests/project-steward/run-unit.sh
# Compiled output goes outside the repo because node --test skips node_modules paths.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${PS_TEST_OUT:-${TMPDIR:-/tmp}/project-steward-tests}"
rm -rf "$OUT"
npx tsc -p tests/project-steward/tsconfig.json --outDir "$OUT"
node --test "$OUT"/tests/project-steward/*.test.js
echo "contract cases written to $OUT/tests/project-steward/contract-cases.json"
