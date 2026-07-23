---
name: Deployment proxy response size limit
description: Why large JSON responses succeed in dev but die silently in the published app
---
Replit deployment proxies cap HTTP responses around 32 MiB. A response over that limit is killed by the proxy: the server logs a 200 success, but the browser receives a dead/non-ok response with no JSON body and an empty HTTP/2 statusText — surfacing as an empty error message client-side. Dev preview has no such cap, so the bug is production-only.

**Why:** SWMM .out results base64-embedded in JSON reached ~40 MB and only failed after publishing.

**How to apply:** Never embed multi-MB binaries as base64 in JSON. Park large results server-side and serve them via a separate gzip-compressed binary endpoint (client fetches arrayBuffer). Always include `resp.status` in fetch error messages since statusText is empty under HTTP/2. Fix requires republishing to take effect.
