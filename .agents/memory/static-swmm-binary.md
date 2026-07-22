---
name: Static SWMM binary for production
description: Why swmm-engine/runswmm must be statically linked (musl) and how to rebuild it
---
The native SWMM binary `swmm-engine/runswmm` must be a fully static executable. Dynamically linked binaries built in the dev workspace reference Nix store glibc paths (e.g. `/nix/store/...-glibc-.../ld-linux-x86-64.so.2`) that do not exist in the production/deployment container, so they fail to spawn there.

**Why:** Autoscale deployments run in a different container without the dev workspace's Nix store; only workspace files are shipped.

**How to apply:** Rebuild with musl (install the `musl` Nix system dependency to get `musl-gcc`):
```
SRC=swmm-engine/Stormwater-Management-Model-5.2.4/src
musl-gcc -O2 -static -o swmm-engine/runswmm $SRC/solver/*.c $SRC/run/main.c \
  -I$SRC/solver -I$SRC/solver/include -lm -lpthread
strip swmm-engine/runswmm
```
Note: no static `libgomp` is available with musl, so OpenMP (`-fopenmp`) must be dropped — results are identical, only multi-core routing speedup is lost. Verify with `file` (should say "statically linked") and the server's `[swmm] engine probe` log line.
