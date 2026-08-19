#!/usr/bin/env bash
# Run the browser end-to-end suites against an already-running app.
# Usage: npm run test:e2e            (app must be serving on BASE_URL)
#        BASE_URL=http://127.0.0.1:5000 npm run test:e2e
#
# These are kept out of `npm test` on purpose: they drive a real Chromium
# against a live server, so they cannot run in a build/deploy context.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE_URL="${BASE_URL:-http://127.0.0.1:5000}"
export BASE_URL

if ! curl -sfo /dev/null "$BASE_URL"; then
  echo "No app responding at $BASE_URL — start it first (npm run dev)."
  exit 1
fi

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

run_suite "Batch Worker & Cancel"       tests/e2e/batch-worker.test.ts
run_suite "Report Summary Gating"       tests/e2e/report-summary-gating.ts
run_suite "LID Viewer Resize"           tests/e2e/lid-viewer-resize.ts
run_suite "Table Context Menu Keyboard" tests/e2e/table-context-menu-kbd.ts
run_suite "Companion App Handshake"     tests/e2e/companion-app-handshake.ts
run_suite "Mode Switching"              tests/e2e/mode-switching.ts
run_suite "Batch Cancel Verdicts"       tests/e2e/batch-cancel-verdicts.ts
run_suite "SWMM6 LID Warning"           tests/e2e/swmm6-lid-warning.ts

echo ""
echo "══════════════════════════════════════════"
echo "  E2E suites: $OK passed, $FAIL failed"
echo "══════════════════════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
