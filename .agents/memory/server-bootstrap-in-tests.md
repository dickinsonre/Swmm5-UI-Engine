---
name: Booting the Express server from tests
description: Why entrypoint detection must never gate startup, and why test-spawned servers must bind loopback via HOST.
---

## Startup must fail OPEN, never behind entrypoint detection

To let tests build the app without binding a port, the obvious move is to gate
the `listen()` block on "am I the process entrypoint?" via
`import.meta.url === pathToFileURL(process.argv[1]).href`. **Do not.**

The production server is bundled by esbuild as **CJS**, which rewrites
`import.meta` to `var import_meta = {};`. The comparison is therefore always
false in `dist/index.cjs`: the published server builds its app and never
listens, while `tsx` dev runs look perfectly healthy. A silent dead deployment.

**The rule:** startup runs by default; a caller opts out with an env flag
(`SWMM_NO_AUTOSTART=1`). A wrong answer then costs a test an extra port instead
of taking production down.

**How to apply:** a test that imports the server module for its app object must
set the flag *before* a **dynamic** import — a static import is hoisted above
the assignment and the module autostarts anyway. Child processes need the flag
passed in their env explicitly; conversely a child that is meant to assert the
default must `delete` it from the inherited env.

Any future "only start when run directly" refactor must be validated against
the *bundled* output, not the dev runtime.

## Test-spawned servers must bind loopback

Replit's port detector watches for newly observed listening ports and writes a
`[[ports]]` mapping into `.replit` for each one. A test that boots the server on
an ephemeral port therefore mutates the user's deploy config on **every run** —
randomised ports add a fresh junk entry each time.

**How to apply:** keep `0.0.0.0` as the default host but make it overridable
(`process.env.HOST`), and have tests boot with `HOST=127.0.0.1` on a single
fixed port. Loopback binds are not registered. Verify with
`git status --short .replit` after a full test run.
