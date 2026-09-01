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
run_suite "Long-Run .out Decimation"   tests/out-truncation.test.ts
run_suite "Sampled-Series Step Timing" tests/step-timing.test.ts
run_suite "Engine Fallback & Limits"   tests/engine-fallback.test.ts
run_suite "Synthetic Export Marking"   tests/synthetic-export.test.ts
run_suite "No Fabricated Time Series"  tests/no-fabricated-series.test.ts
run_suite "SWMM6 Option Gating"        tests/swmm6-option-gating.test.ts
run_suite "Report Parsing (5 and 6)"   tests/rpt-parsing.test.ts
run_suite "LID Parity Gate"            tests/lid-parity.test.ts
run_suite "External Refs Fidelity"     tests/external-refs.test.ts
run_suite "Out-Diff Impl Parity"       tests/out-diff-parity.test.ts
run_suite "Report Side-by-Side Diff"   tests/report-diff.test.ts
run_suite "Two-Table Consistency"      tests/table-consistency.test.ts

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
