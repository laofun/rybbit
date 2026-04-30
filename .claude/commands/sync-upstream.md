---
description: Sync this fork from upstream/rybbit-io. Fast-forwards master, rebases heatmaps-integration, rebuilds analytics scripts, typechecks. Stops before pushing.
---

You are syncing the fork from upstream. Follow these steps in order. **Stop and ask the
user** if any step has unexpected output (a non-trivial conflict, a typecheck failure,
unrelated working-tree changes).

## Pre-flight

1. Run `git status` — abort if the working tree is dirty.
2. Run `git branch --show-current` — confirm we're on `heatmaps-integration` or note current branch.
3. Read `FORK_PATCHES.md` — keep the patch inventory (especially the Medium/High risk rows) in mind during conflict resolution.

## Sync sequence

```bash
git fetch upstream
git checkout master && git merge --ff-only upstream/master
git checkout heatmaps-integration && git rebase master
```

If rebase has conflicts:
- Resolve them by **preserving fork intent** — refer to FORK_PATCHES.md for which lines are ours
- For `server/public/script*.js` conflicts: keep upstream's version, the rebuild step below regenerates ours
- Continue with `git rebase --continue`
- If conflicts look suspicious or scattered, stop and surface them to the user before continuing

## Verify

```bash
cd client && npm install && npx tsc --noEmit
cd ../server && npm install && npx tsc --noEmit
cd server && npm run build:analytics
```

If `server/public/script*.js` changed after the rebuild, commit them as a separate
commit on `heatmaps-integration`:

```bash
git add server/public/script.js server/public/script-full.js
git commit -m "chore(fork): rebuild analytics scripts after upstream sync"
```

## Report

Summarize for the user:
- How many commits master moved forward
- Whether rebase was clean or had conflicts (and which files)
- Whether typecheck passed on both client and server
- Whether analytics scripts changed
- The exact push commands they should run (do **not** push automatically — pushing master and force-pushing heatmaps-integration both require explicit user confirmation):
  ```
  git push origin master
  git push --force-with-lease origin heatmaps-integration
  ```

## Do not

- Do not run `git push` yourself — leave that to the user
- Do not edit `FORK_PATCHES.md` unless the patch surface actually changed
- Do not skip the typecheck step even if rebase was clean
