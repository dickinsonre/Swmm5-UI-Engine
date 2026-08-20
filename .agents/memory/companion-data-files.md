---
name: External data files beside the .inp
description: How models that reference sibling data files (FILE rain gages, FILE time series) get those files to each engine, and the traps that make a missing file look like a valid dry run.
---

# External data files referenced by a model

Desktop SWMM resolves `FILE rain.dat` relative to the folder holding the `.inp`,
so users think of the data file as part of the model. A browser never sees that
folder. Users attach the sibling files explicitly, and every engine places them
next to the model before running.

## The failure this prevents

A model whose rainfall lives in an external file and does not receive that file
does **not** always fail loudly:

- SWMM5 native raises `ERROR 317: cannot open rainfall data file <path>` — loud.
- Other paths can produce a **completely dry run**: no error, plausible-looking
  output, zero runoff. This is the worst outcome for a hydrologist, because
  nothing on screen says the answer is wrong.

**Why:** any engine path that cannot carry attachments must REFUSE to run rather
than run without them. A cloud/remote runner whose upload contract is
model-only falls in this category — silently dropping the file there is a
correctness bug, not a limitation.

**How to apply:** when adding a new engine or run path, either place the
attachments or throw a clear error naming the files that could not be delivered.
Never let health/status show a reference as satisfied while the run path drops it.

## Not just rain gages

`FILE` appears in more than one section. Rain gages are the obvious case;
time series (`name FILE "path"`) are the one that gets forgotten. Any new
section that can name an external path must be added to the reference collector,
or the file silently never ships.

## Attachments are per-model state

The registry is keyed by base file name, so two models can reference the same
name and mean different files. **Loading any new model must clear the
attachments**, and a batch of independent models must not borrow the open
model's attachments — refuse those models instead.

Watch the ordering: a handler that attaches companions and then opens the model
wipes the files just dropped. Open first, attach second.

A reference is model data, not a trusted path: collapse anything that could
climb out of the model directory, and never let a reference name the run's own
model/report/output files.

## Size budget for server runs

Companions travel to the server as base64 inside a JSON body, which inflates the
bytes by 4/3, and the model text shares the same budget as the files.

**Why:** a client-side limit quoted at or near the server's raw body cap
produces an opaque 413 instead of the clear "files too large" message.

**How to apply:** keep `attachment limit x 4/3 + room for the .inp` comfortably
under the server body cap, and assert that arithmetic in a test — it is exactly
the kind of constant that drifts.

## express.json() has already eaten the body

A route that reads the raw request stream itself **hangs forever** when given
`application/json`, because the global `express.json()` middleware already
consumed the stream. There is no error — the request never completes, which
looks exactly like a slow engine.

**How to apply:** in any route accepting both raw text and JSON, branch on
content type FIRST and read the parsed body for the JSON case.

## Testing note

A fake filesystem cannot prove the bytes reach a real engine. The check that
matters runs the same model twice — once without the file (expect the engine's
own "cannot open" error) and once with it (expect an exact known rainfall
depth). The failing run is what makes the passing run meaningful.
