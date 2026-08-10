---
name: Typed-array offsets vs binary parsers
description: Normalize Uint8Array views before passing .buffer to parsers that assume offset 0
---

Rule: never pass `view.buffer` to a binary parser (e.g. the SWMM .out parser) — a Uint8Array may be a view with non-zero `byteOffset` into a larger buffer, especially from Emscripten `FS.readFile` heap views or after crossing a worker postMessage boundary. Use the `toExactArrayBuffer` helper in the engine lib (slices to the view's exact byte range, passes through exact views).

**Why:** the .out parser reads the SWMM magic number at offset 0; an offset view silently mis-parses or falls back to report-only results. Completion review rejected the batch-worker task for exactly this.

**How to apply:** any new code path that hands binary engine output to `parseSwmmOut` (or similar) must normalize the view first; regression test exists at `tests/out-offset.test.ts`.
