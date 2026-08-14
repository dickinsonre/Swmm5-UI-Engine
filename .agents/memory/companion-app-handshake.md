---
name: Companion app model handshake
description: The swmm:ready / swmm:model postMessage contract between the workbench and embedded third-party apps, and the two rules that keep it safe.
---

# Companion app model handshake

Embedded companion apps (Help → Apps) receive the open model over `postMessage`.
The app announces `{ type: 'swmm:ready', accepts: [...] }`; the workbench replies
to that frame with `{ type: 'swmm:model', name, engine, inp, rpt?, out?, lid? }`.
Author-facing spec lives in `docs/companion-app-contract.md`.

## Rules that must not be relaxed

1. **Never auto-send the binary `.out`.** Handshake replies carry text artifacts
   only; `out` goes only on the user's explicit "Send model" click.
2. **One automatic delivery per document.** Further `swmm:ready` messages from
   the same frame are ignored until it navigates or the user switches apps.
3. **Nothing is pushed to a frame that has not announced itself.**

**Why:** serializing the project and structured-cloning results is expensive and
the results can be tens of megabytes, so a frame that repeats the announcement —
buggy or hostile — could stall the parent tab. And companion URLs are arbitrary
user-supplied third-party sites: automatic disclosure has to stay at the minimum
that makes the feature work.

**How to apply:** any change to the launcher's messaging, or a new app-embedding
surface, keeps all three. The older local 3D viewer uses its own
`swmm3d-ready` / `load-inp` handshake and predates this; new surfaces use `swmm:*`.

## Authenticating the sender

The iframe is sandboxed without `allow-same-origin`, so its origin is `"null"`
and `e.origin` is useless. Match `e.source === iframeRef.current.contentWindow`
— a nested frame inside the app has a different `WindowProxy`, so it cannot
spoof this. Outbound posts must use `'*'` as targetOrigin; an opaque origin
cannot be named.
