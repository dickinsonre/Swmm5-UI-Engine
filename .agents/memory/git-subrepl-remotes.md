---
name: Dead subrepl remotes break the Git pane
description: Why the workspace Git UI throws "Unknown Git Error / UNKNOWN" while shell git works fine, and how to clear it.
---

When task agents run, each one leaves behind a remote named `subrepl-<id>` pointing at
`git+ssh://git@ssh.picard.replit.dev:/home/runner/workspace`, plus a matching local branch.
Those SSH endpoints die when the subrepl is torn down, but the remotes stay in `.git/config`
forever and accumulate (30+ is normal after a long project).

**Symptom:** the workspace Git pane reports `Unknown Git Error / UNKNOWN — there was an
unrecognized fatal error with Git`, while `git status` in the shell is perfectly healthy.

**Why:** anything that touches every remote (`git fetch --all`, and whatever the pane runs
behind the scenes) blocks on each dead SSH host until it times out. `git ls-remote <subrepl>`
returns exit 124 rather than an error, so the failure surfaces as "unknown" instead of a
network message. A stale `.git/objects/maintenance.lock` can sit alongside it and quietly
block background gc.

**How to apply:** diagnose with `git remote -v | grep subrepl` and a timed
`timeout 10 git ls-remote <one-subrepl>`. Fix by removing the dead remotes
(`for r in $(git remote | grep '^subrepl-'); do git remote remove "$r"; done`) and deleting
any stale `.git/*.lock` / `.git/objects/*.lock`. Verify with `time git fetch --all` — it should
finish in well under a second. Back up `.git/config` first.

**Same symptom, other causes** — the pane reports every fatal git error as "UNKNOWN", so work
through these too:

- *The GitHub repo was renamed or transferred.* Fetch silently follows GitHub's 301 redirect
  (so the pane happily says "last fetched just now") but **push over a redirect is refused**.
  Detect with `curl -s -o /dev/null -w "%{redirect_url}" <remote url>`; fix with
  `git remote set-url origin <new url>`.
- *Expired GitHub OAuth token.* `git push --dry-run` returns "Invalid username or token.
  Password authentication is not supported". `GIT_ASKPASS` is set by the platform and there is
  no credential helper in `.git/config`, so this is not agent-fixable — the user must
  disconnect and reconnect GitHub in Replit account settings → Git Providers. Anonymous fetch
  keeps working on a public repo, which is why the failure looks push-only.

The leftover local `subrepl-*` **branches** are separate: they are NOT merged into `main`
(each holds the task agent's own divergent history, merged into main as a squash), so they
only delete with `git branch -D`. They are harmless clutter and are not part of this failure —
never force-delete them without asking the user.
