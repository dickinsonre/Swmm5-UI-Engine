---
name: Verification tooling exists twice on purpose
description: Why the .out diff and xsect table checks are duplicated between a dependency-free script and app code, and the parity rule that keeps them honest.
---

# Verification tooling exists twice on purpose

The rule: the corinne-testing scripts stay **plain node with zero dependencies and no loader flags**, and any in-app version of the same measurement is a **second implementation held to byte-for-byte identical output by a parity test**. Never "fix" the duplication by having one import the other.

**Why:** the scripts have to run against any pair of files from a shell, on a checkout with nothing installed — that portability is the whole reason they are trustworthy as an independent check. Two things block the obvious de-duplication: `tsconfig.json` does not set `allowJs`, so a shared plain-`.js` module in `shared/` cannot be imported from TypeScript at all; and making the script import app code would drag in the app's module resolution and defeat its purpose. Generated constant tables are shared as **JSON** rather than ESM for the same reason.

Duplication is only safe while it is *provably* duplication, so the parity test asserts the two produce identical numbers — not close ones. A tolerance here would be self-defeating: a verification tool that cannot reproduce itself has nothing to say about whether an engine reproduces itself.

**How to apply:** when changing either side of a duplicated measurement, change both and run the parity suite. The parity test must exercise the *option combinations*, not just the default path — a shared default-path fixture cannot expose a shared misread of an alternate header. Cover at minimum: every CLI flag, refusal/precondition cases (each with its own fixture), and a `Uint8Array` with non-zero `byteOffset`. Constants must be **generated from the vendored EPA source**, never transcribed, with a drift test that re-derives them and fails if the committed copy has moved.
