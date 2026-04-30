---
description: Fast-forward the deploy branch from heatmaps-integration to trigger a Coolify rebuild. Verifies build readiness before promoting.
---

You are promoting the current `heatmaps-integration` HEAD to the `deploy` branch,
which Coolify watches. After this command runs, Coolify will start a production build.

## Pre-flight

1. `git status` — working tree must be clean.
2. `git branch --show-current` — current branch should be `heatmaps-integration` (or warn the user).
3. Confirm typecheck passes:
   ```bash
   cd client && npx tsc --noEmit
   cd ../server && npx tsc --noEmit
   ```
   If either fails, stop. Production should not deploy a broken typecheck.
4. Show the user the diff between `deploy` and `heatmaps-integration`:
   ```bash
   git log --oneline deploy..heatmaps-integration
   ```
   Pause and confirm the user wants to promote these commits to production before continuing.

## Promote

```bash
git checkout deploy
git merge --ff-only heatmaps-integration
```

If fast-forward fails (history diverged — rare, only happens after a forced rewrite),
**stop and ask the user** before doing a hard reset. Do not silently force the branch.

## Push

```bash
git push origin deploy
```

This triggers Coolify. Tell the user the push is done and Coolify will rebuild on its own.

## Return to dev branch

```bash
git checkout heatmaps-integration
```

## Do not

- Do not commit directly on `deploy` — it is a fast-forward-only branch
- Do not `git reset --hard` `deploy` without explicit user confirmation
- Do not skip the typecheck step
