---
name: .inp round-trip fidelity — names hidden in numeric token slots
description: Why every .inp section writer must be checked token-for-token against its parser, and the trap of names living in slots that look numeric.
---

# .inp round-trip fidelity

**The rule:** a section writer must emit every token its parser consumed, in the
same slots. A writer that emits fewer tokens, or that re-derives a token from a
parsed number, is a silent data-loss bug.

**Why:** EPA SWMM reads sections strictly by token POSITION, and several
sections put an object **name** in a slot that is numeric for every other
variant of that section (a shape curve, a transect, a street, a rain-gage
station). Running such a slot through a float helper yields 0, and optional
trailing columns are easy to forget entirely. The damage happens on SAVE, so the
model opens, displays and edits perfectly — it only breaks when the engine reads
the file back, and then it reports a syntax error against a line the user never
wrote. Users blame their model or the engine, never the workbench that rewrote
the file. A whole family of these shipped undetected because every visible field
looked right.

Shape- or type-keyword-dependent layouts (`[XSECTIONS]` above all) and optional
trailing columns (`[AQUIFERS]`, `[GROUNDWATER]`, `[RAINGAGES]`) are where this
hides. Placeholder tokens matter too: a literal `*` means "use the default" and
is not interchangeable with the 0 a float parse produces.

**How to apply:**
- When touching any section parser or writer, count tokens on both sides before
  anything else, and check the type/shape keyword before parsing a slot.
- Keep optional trailing tokens as raw strings and re-emit them verbatim.
  Nothing computes on them; parsing them only loses information.
- Assert on the WRITTEN TEXT and on token INDEX. A value preserved in the object
  but written to the wrong slot is still a broken file.
- Round-trip the real shipped sample, not just a hand-built fixture — the sample
  exercises optional columns that stub fixtures omit. Guard such tests with a
  "fixture still contains the feature" assertion so they cannot pass on nothing.
- Watch for writers that DROP rows on purpose (an `IRREGULAR` section whose
  transect is undefined is skipped). A stub fixture missing `[TRANSECTS]` or
  `[CURVES]` makes those rows vanish and any test asserting on them passes
  vacuously.
- If the UI can set a shape/type that requires a named reference, it needs a
  field for that reference, or it becomes a corruption path of its own.

**Related:** external data files named in the .inp (rain `FILE` gages, interface
files) are not part of the .inp and are never written into the Emscripten FS —
in-browser runs cannot open them however correct the syntax is.
