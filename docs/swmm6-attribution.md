# Shipping SWMM6: what this project must carry

Mechanical checklist for redistributing the OpenSWMM 6 engine. Not legal advice.
Upstream `LICENSE` and `NOTICE` last verified live **2026-09-03**.

## 1. The branch trap — check this first, every time

`github.com/HydroCouple/openswmm.engine` is not one license:

It is not even one license per *project* — the published artifacts disagree with
each other. All four rows verified 2026-09-03; the wheel row by unpacking the
wheel, not by reading its PyPI page (PyPI's own license classifiers are empty).

| Artifact | LICENSE | Copyright line | NOTICE | Shipped here |
|---|---|---|---|---|
| `main` branch | MIT | Copyright (c) 2025 HydroCouple | no | no |
| `develop` branch | MIT | Copyright 2026 Caleb Buahin | no | yes — `client/public/wasm6dev` |
| `swmm6_rel` branch (the 6.0.0 release line) | **Apache-2.0** | Copyright 2026 HydroCouple Developers | **yes** | yes — `client/public/wasm6` |
| PyPI wheel `openswmm==6.0.0a3` | MIT | Copyright 2026 Caleb Buahin | no | no |

And the two MIT texts are not the same text. The `develop` LICENSE ends with a
paragraph placing the USEPA-derived material in the public domain under 17 USC
§ 105; the wheel's `dist-info/licenses/LICENSE` drops it. Same license, same
holder, different file:

```
develop LICENSE        sha256 d31d6c5482aabe7a72cced9509b0c73b7fd96f401e7cbb86e066c631980f9b33
wheel 6.0.0a3 LICENSE  sha256 15e5586cd6ab489ae158245345f604beacc78796a9c45825c1e0cfbb7b23160f
```

GitHub's sidebar says "Other License" because of this split. So there is no
answer to "what license is SWMM6?" — only an answer per artifact.

**The working rule: honour whatever ships *inside* the artifact you redistribute,
and record which artifact it was.** Not the repo's headline license, not the
sidebar, not what the project said last month. This project ships builds of two
different branches, so it carries two different sets of terms: the `wasm6`
build needs the Apache conditions and the NOTICE, the `wasm6dev` build needs the
MIT copyright and permission notice and must **not** carry the Apache NOTICE,
which does not apply to it. Never quote the `main` README's MIT line for a
6.0.0 build.

The divergence is worth reporting upstream rather than guessing at — it is a
genuine alpha-tester finding, and the project is asking for those.

Before shipping, record the branch **and commit** the code came from, and re-read
`LICENSE` and `NOTICE` at that commit. An alpha moves.

## 2. When the conditions bite

Apache section 4 attaches to **redistribution**, not use. Running the engine and
publishing the `.rpt` numbers triggers nothing. All of these do trigger it, and
this project does the first three:

- a repo or gist containing OpenSWMM source (Source form)
- a compiled `.wasm` / `.js` engine artifact deployed anywhere (Object form)
- a single-file `.html` with the engine base64-embedded via `SINGLE_FILE` — still
  distribution of Object form, and the easiest one to forget
- an npm package or zip with the engine inside

**Compiling unmodified source is not "modifying files".** Section 4(b) attaches
to changed *files*, not to the act of building, so a clean checkout of
`v6.0.0-alpha.3` built native — or the official PyPI wheel, which is upstream's
own binary — needs only (a), (c) and (d). No per-file change notices, no fork.

What pulls **this** project into 4(b) is the browser build specifically: the
three Emscripten patches (`PluginFactory.cpp`, `IOThread.cpp`, the OpenMP
symbol dedup in `swmm5.c`), plus the LID report added on top. CMake exposes no
option that removes them. Two ways out, if the obligation is ever worth
shedding: upstream the Emscripten patches to `swmm6_rel` so everyone gets a
browser build from clean source, or try replacing them with build flags — a
pthread build with COOP/COEP headers for `IOThread`, `--allow-multiple-definition`
for the symbol collision. **The second is a hypothesis, not a result.** It would
need a round-trip `.out` diff against an unpatched build before anyone claimed
the engines agree.

That unpatched build is also the reference oracle this project does not
currently have: `pip install openswmm==6.0.0a3` gives upstream's own binary, so
the fidelity of the WASM build can be *shown* by diffing `.out` files rather
than asserted.

## 3. The four conditions, and where each is satisfied here

| Condition | Where this project satisfies it |
|---|---|
| **(a)** give recipients a copy of the License | `licenses/Apache-2.0-OpenSWMM.txt` in the repo; `/licenses/Apache-2.0-OpenSWMM.txt` served by the deployed app and linked from About → Licenses. An SPDX tag alone is **not** "a copy". |
| **(b)** mark files you changed | The patch inserts a change notice at the top of every file it touches (hunk #1 of each file), so applied sources carry it; plus `swmm-engine/patches/MODIFICATIONS.md` (per file: what, who, when) and a header comment on each compiled `.js` artifact. A patch preamble alone is **not** enough — once applied, the files must carry the notice. |
| **(c)** retain notices already in the files | Do not strip copyright / patent / trademark / EPA-provenance headers when refactoring or minifying engine sources. |
| **(d)** reproduce the NOTICE | Root `NOTICE`, the shipped copy at `client/public/licenses/NOTICE.txt`, and the About → Licenses panel, which is the section 4(d) "display generated by the Derivative Works" route for a browser app. |

The upstream NOTICE is reproduced **verbatim** at the top of the root `NOTICE`;
this project's own attribution is appended below a marker line. Additions are
allowed; altering or dropping theirs is not. Section 4(d) also permits excluding
notices that do not pertain to the derivative — but the third-party-components
paragraph pertains the moment a vcpkg dependency is bundled, so it stays.

## 4. What the license does not do

- **No copyleft.** Apache-2.0 is permissive. This project's own code is MIT; the
  notices travel with the engine, that's all. Nobody has to open-source their app
  to embed the engine.
- **No claim on the EPA lineage.** The public-domain SWMM material stays public
  domain; the Apache grant does not reach back over it.
- **No trademark license (section 6).** "EPA", "USEPA" and "SWMM" describe origin
  only. Never imply EPA endorsement, and never present a derivative as "SWMM 6"
  itself.
- **Patent grant with a termination clause (section 3):** suing over patents in
  the work ends the patent grant.

## 5. Credit line for a paper, slide or post (courtesy, not the license)

> Simulations used OpenSWMM 6.0.0-alpha (HydroCouple), Apache-2.0,
> https://github.com/HydroCouple/openswmm.engine, commit `<sha>`.
> Lead developer Caleb Buahin; developer/documentation Corinne Wiesner-Friedman.

`docs/authors.md` upstream credits Lew Rossman, Wayne Huber and Larry Roesner,
and lists Robert Dickinson under SWMM 5 review and testing — worth citing, and no
substitute for section 4.

Alpha-program feedback goes through the form Corinne posted:
https://forms.gle/Cf3JaNpQ1suGn8kt5

## 6. Checklist before publishing anything with SWMM6 in it

- [ ] Branch and commit recorded; `LICENSE`/`NOTICE` re-read at that commit
- [ ] Confirmed the source is `swmm6_rel` (Apache-2.0), not `main` (MIT)
- [ ] Full Apache-2.0 text ships with the work
- [ ] Upstream NOTICE reproduced verbatim — file, docs, or About panel
- [ ] Every patched engine source recorded with "modified by / when / why"
- [ ] Existing copyright and EPA-provenance headers left intact
- [ ] `SINGLE_FILE` / base64-embedded builds treated as redistribution too
- [ ] This project's own copyright and license stated separately from theirs
- [ ] No wording that implies EPA or HydroCouple endorsement

Two traps this project has already walked into, both worth re-reading before a
release:

- **A new file you wrote is not upstream's.** The two new LID-report sources in
  the patch were created with a copied neighbouring header, so they claimed
  `Copyright 2026 Caleb Buahin` for files that exist on no upstream branch.
  Copying a header is how a misattribution gets written; check `git log` or the
  upstream tree before believing one.
- **A second build can come from a second branch.** The develop artifact was
  first documented as Apache-2.0 because the release build is. Check the branch
  for every artifact separately.

`tests/attribution.test.ts` enforces the mechanical half of this list at build
time — the verbatim NOTICE, all shipped copies, the artifact headers and the
About panel wiring. It cannot check a commit SHA nobody recorded, verify that a
recorded branch is the branch actually built, or judge endorsement wording.
