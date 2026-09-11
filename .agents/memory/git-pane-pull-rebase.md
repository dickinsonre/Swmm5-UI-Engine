---
name: The Git pane syncs with pull --rebase, so merge resolutions do not stick
description: Why MERGE_CONFLICT keeps coming back in the workspace Git pane even after the conflict has been merged and committed in the shell.
---

The workspace Git pane's Sync runs `git pull --quiet --no-edit --rebase origin main`
(visible in `git reflog` as `pull ... --rebase ... (start): checkout <upstream>` followed by
a run of `(pick)` entries). It does **not** merge.

**The trap:** resolving an upstream conflict with `git merge` and committing it looks like it
worked — the shell reports `ahead N, behind 0`, `merge-base --is-ancestor` says the upstream
commit is in — and then the pane reports `MERGE_CONFLICT` again on the very next Sync, with no
merge in progress and a clean tree.

**Why:** a non-interactive rebase flattens. It drops the merge commit, and with it the
resolution, then replays each *original* commit onto the new upstream tip. Any old commit whose
diff was computed against the pre-upstream version of a file conflicts again. The conflict is
therefore not stale UI and not a one-off — it recurs on every Sync, forever, as long as the
local history contains a merge across the upstream commit.

**How to apply:** when the pane reports a conflict that the shell says is already resolved,
check `git log --oneline --merges <upstream>..HEAD`. If that is non-empty, the pane will keep
failing. Make the history linear instead:

1. `git branch backup/pre-rebase-<date>` first.
2. `git rebase <upstream> -X theirs` — during a rebase "theirs" is the commit being replayed,
   i.e. the local work. Safe only after checking which files the upstream commit actually
   touched; anything else it changed would be silently discarded.
3. `-X theirs` **will** drop the upstream side of a genuinely merged file. Keep the hand-merged
   version (`git show <merge-commit>:<file> > /tmp/keep`) and restore it as a follow-up commit,
   then diff the resulting tree against the merge commit to prove nothing else moved.
4. Verify the loop is broken: `git rebase <upstream>` must say "Current branch is up to date",
   and `git pull --rebase origin main` must exit 0 with no conflict.

**Related:** a failing *push* is a different problem with a different message — see
git-subrepl-remotes.md for expired GitHub OAuth, which blocks push while anonymous fetch keeps
working on a public repo.
