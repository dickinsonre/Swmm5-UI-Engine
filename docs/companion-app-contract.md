# Companion app model contract

The **Companion Apps** dialog (Help → Apps) embeds other SWMM web apps in an
iframe. A companion app that implements the handshake below receives the model
the user already has open, instead of asking them to drop a file in again.

Add roughly twenty lines to the companion app and it becomes a lens on the
current model rather than a separate tab.

## Handshake

1. The app boots inside the iframe and announces what it can take:

   ```js
   parent.postMessage({ type: 'swmm:ready', accepts: ['inp', 'out'] }, '*');
   ```

2. SWMM5 UI replies to that frame with the open model:

   ```js
   {
     type:   'swmm:model',
     name:   'Greenville_US.inp',   // file name of the open project
     engine: 'wasm' | 'wasm6' | 'wasm6dev' | 'local' | 'remote' | 'mock' | null,
     inp:    '[TITLE]\n...',        // .inp text, always sent unless filtered out
     rpt:    '  EPA SWMM 5.2.4 ...',// report text, if a run has produced one
     out:    Uint8Array,            // raw binary .out, if the run produced one
     lid:    '...'                  // consolidated .lid report, if present
   }
   ```

`accepts` filters the payload: ask only for what you use, so a large `.rpt`
isn't cloned for an app that only reads the network. Omit `accepts` entirely to
receive everything available.

`out` is a real `Uint8Array` delivered by structured clone — no base64, no
JSON round trip.

**`out` is never sent automatically.** The binary results can run to tens of
megabytes, so the handshake reply carries the `.inp`, and the `.rpt` / `.lid`
text when a run has produced them. The user gets the `.out` to your app by
clicking **Send model**. Ask for it in `accepts` and handle its absence.

Each document gets **one automatic delivery**. Repeating `swmm:ready` will not
produce another payload — the parent would have to re-serialize the model every
time, which a buggy or hostile frame could use to stall the tab. Navigating or
reloading your app starts a fresh handshake.

## Minimal receiver

```js
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || d.type !== 'swmm:model') return;
  if (d.inp) loadInpText(d.inp, d.name);
  if (d.out) loadOutBinary(d.out);
});

// Announce once the listener is attached.
parent.postMessage({ type: 'swmm:ready', accepts: ['inp', 'out'] }, '*');
```

## Notes for app authors

- **Announce late.** Post `swmm:ready` only after your listener is attached;
  the reply can arrive on the next tick.
- **Expect to be re-sent.** The user can click *Send model* at any time — after
  editing the model or re-running it. Treat `swmm:model` as "replace what you
  have", not "first load only".
- **The frame is sandboxed** with `allow-scripts allow-forms allow-popups
  allow-downloads` and no `allow-same-origin`, so your origin inside the iframe
  is opaque. Post to `'*'`; don't rely on `e.origin`.
- **Nothing is pushed unsolicited.** Companion app URLs are user-supplied
  third-party sites, so the model is only sent to a frame that announced
  `swmm:ready`, or when the user clicks *Send model*.
- The local 3D viewer (`client/public/3d-viewer.html`) predates this contract
  and uses its own `swmm3d-ready` / `load-inp` handshake, driven by
  `Viewer3DDialog`. New apps should use `swmm:*`.
