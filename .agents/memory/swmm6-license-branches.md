---
name: OpenSWMM 6 licence differs per branch
description: HydroCouple/openswmm.engine is not one licence — the branch an artifact was built from decides its terms, and this app ships two branches at once.
---

`github.com/HydroCouple/openswmm.engine` carries a different licence per branch
(verified live 2026-09-03):

| Branch | Licence | Copyright | NOTICE file |
|---|---|---|---|
| `main` | MIT | 2025 HydroCouple | no |
| `develop` | MIT | 2026 Caleb Buahin | **no** |
| `swmm6_rel` (the 6.0.0 release line) | **Apache-2.0** | 2026 HydroCouple Developers | **yes** |

GitHub's sidebar says "Other License" because of the split.

This app ships builds of **two** of them: `client/public/wasm6` from `swmm6_rel`
(Apache-2.0) and `client/public/wasm6dev` from `develop` (MIT). A notice that is
correct for one artifact is wrong for the other.

**Why:** the Apache branch adds obligations MIT does not — reproduce the NOTICE,
ship the full licence text, mark changed files (§4(b)), keep upstream headers
(§4(c)). Applying those to the MIT artifact invents a licence it isn't under;
skipping them for the Apache one is a breach. Both mistakes were made here
before being caught.

**How to apply:**
- Before writing any licence text, check which branch the artifact came from.
  Never generalise "SWMM6 is Apache-2.0" — that is only `swmm6_rel`.
- Object form (a `.wasm`/`.js` build) is redistribution. Each engine's glue file
  carries its own banner, and they must not be copies of each other.
- §4(b) is satisfied by the patch inserting a notice as hunk #1 of every file it
  modifies, so applied sources carry it. A patch preamble alone is not enough.
- A **new** file authored here is not upstream's. Copying a neighbouring file's
  header is how a false `Copyright <upstream author>` gets shipped; check the
  upstream tree before believing any header.
- The licence texts exist twice on purpose: repo root, and `client/public/licenses`
  so the deployed page can serve them. A repo-only file satisfies nothing for
  someone who only loads the app.

Compliance is enforced mechanically, because every failure here is silent — no
error, no broken build, just a wrong or missing notice nobody clicks:
- `tests/attribution.test.ts` covers the repo (upstream texts pinned by sha256 —
  an upstream edit is *meant* to fail the build).
- `script/verify-dist-licenses.ts` runs **after** the bundler in `npm run build`
  and covers the shipped output. Do not make it conditional on `dist` existing
  or being fresh; a skip-if-absent check skips exactly when it matters.

Provenance gap: the upstream commit behind each shipped artifact was never
recorded, only the branch. Record the SHA on the next rebuild. Upstream has
drifted far past the patch's base, so the patch is not a clean rebuild recipe —
`patch -p1 --forward`, expect offsets and LID rejects, and treat a rejected
hunk #1 as a blocker rather than shipping unmarked sources.
