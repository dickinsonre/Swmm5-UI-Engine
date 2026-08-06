---
name: E2E browser testing in this repl
description: How to run Playwright e2e tests here when the testing subagent is unavailable
---

Rule: use `playwright-core` with the Nix system `chromium` binary (`executablePath: execSync('which chromium')`, `--no-sandbox`). The Playwright-downloaded headless shell fails with missing `libglib-2.0.so.0` in this NixOS environment.

**Why:** the `testing` subagent kind rejects with "Unknown config kind: testing" in isolated task environments even though the schema lists it; local Playwright is the working fallback.

**How to apply:** for browser tests, install `playwright-core` + Nix `chromium`, run scripts via `npx tsx`. Also: the app's animation timer constantly re-renders result-table rows, so positional clicks on table cells go "element is not stable / detached" — use `page.dispatchEvent(sel, 'contextmenu')` / JS-dispatched events instead.
