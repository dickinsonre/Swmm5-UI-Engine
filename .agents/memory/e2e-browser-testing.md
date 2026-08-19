---
name: E2E browser testing in this repl
description: How to run Playwright e2e tests here when the testing subagent is unavailable
---

Rule: use `playwright-core` with the Nix system `chromium` binary (`executablePath: execSync('which chromium')`, `--no-sandbox`). The Playwright-downloaded headless shell fails with missing `libglib-2.0.so.0` in this NixOS environment.

**Why:** the `testing` subagent kind rejects with "Unknown config kind: testing" in isolated task environments even though the schema lists it; local Playwright is the working fallback.

**How to apply:** for browser tests, install `playwright-core` + Nix `chromium`, run scripts via `npx tsx`. Also: the app's animation timer constantly re-renders result-table rows, so positional clicks on table cells go "element is not stable / detached" — use `page.dispatchEvent(sel, 'contextmenu')` / JS-dispatched events instead.

## Driving the workbench toolbar

The toolbar is menu-scoped: a button only exists in the DOM while its menu tab
is active. `btn-run` lives under Project, `btn-samples` under File, `btn-apps`
under Help — click `menu-<name>` first or the locator times out with no clue why.

A finished run leaves a dialog open, whose Radix overlay swallows clicks on the
menu bar. Press Escape until `[data-component-name="DialogOverlay"]` is gone
before driving the menus again.

Waiting for results: `engine-health-strip` appears only once a run has produced
results, which makes it the reliable readiness signal. `btn-animate` is not —
it is menu-scoped like everything else.

## Traps that cost real time

- **`__name is not defined` inside `page.waitForFunction`.** tsx transpiles a
  nested named arrow helper in the predicate into a `__name(...)` call that does
  not exist in the browser. Pass the predicate as a *string* with no inner named
  functions.
- **`btn-engine-toggle` cycles the WHOLE engine list and Mock is LAST**, so a
  bounded click loop must exceed the list length (currently 9: Local, WASM 5,
  WASM 6 rel, WASM 6 dev, three Compare modes, Remote, Mock). A bound that was
  once sufficient silently stops reaching the tail as engines are added, and the
  failure looks like "engine set to X" with no hint why — log the labels seen.
- **`btn-find` is not unique.** There is a no-op top-bar icon and the real
  Project-menu entry. Disambiguate (e.g. filter by visible text) or you will
  drive the dead one and see nothing happen.
- **`tests/fixtures/lid_test.inp` has no `[COORDINATES]`**, so nothing can be
  selected on the map in it — Find cannot resolve an object. Use a bundled
  sample such as `client/public/samples/Extran9.inp` for any test that needs
  selection; keep lid_test.inp for LID behaviour.
- **Prove the suite can fail before trusting it**: sabotage the feature, confirm
  red, restore. A UI assertion that matches nothing looks identical to a pass.
- **Readiness signals from a previous run are the main source of vacuous
  passes.** `engine-health-strip` (and the Run button) persist after the first
  run, so a second `waitForSelector` on them returns instantly and any
  "warning stays quiet" check then runs *before* the new run finished — green
  for the wrong reason. Wait on a signal that is fresh per run (the completion
  toast, or a state transition you observed change), never on a selector that
  survived the last one.
