#!/usr/bin/env bash
# Run all SWMM5-UI automated tests.
# Usage: bash tests/run-all.sh
#
# To wire into npm: add  "test": "bash tests/run-all.sh"  to package.json scripts.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OK=0
FAIL=0

run_suite() {
  local label="$1"
  local script="$2"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $label"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if npx tsx "$script"; then
    OK=$((OK + 1))
  else
    FAIL=$((FAIL + 1))
  fi
}

run_suite "INP Round-Trip Audit"        tests/roundtrip/run.ts
run_suite "Calibration Parser/Export"   tests/calibration.test.ts
run_suite "CFL Analysis & Discretize"  tests/cfl.test.ts
run_suite "Engine Scatter Comparison"  tests/scatter-compare.test.ts
run_suite "Batch Verdict Comparison"   tests/batch-compare.test.ts
run_suite "Binary .out Offset Parsing" tests/out-offset.test.ts
run_suite "SWMM6 LID Trust Warning"    tests/swmm6-lid-warning.test.ts

# NOTE: tests/e2e/* are deliberately NOT run here. They drive a real browser
# against a running server (BASE_URL, default http://127.0.0.1:5000), so they
# would fail in a build/deploy context where nothing is serving.
# Run them with the app up:  npm run test:e2e

echo ""
echo "══════════════════════════════════════════"
echo "  Test suites: $OK passed, $FAIL failed"
echo "══════════════════════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
