# CLAUDE.md

Guidance for Claude Code when working in this repository.

> **This is a fork.** Before editing files that exist upstream, read `FORK_PATCHES.md` —
> it lists every local patch and its merge risk. Sub-CLAUDE.md files in `client/`,
> `server/`, and `docs/` cover area-specific conventions.

## Branch model

```
master                 ← mirror of upstream/master, only fast-forward merges
heatmaps-integration   ← dev branch = master + the patches in FORK_PATCHES.md
deploy                 ← what Coolify watches; auto-deploys on push
```

Day-to-day work happens on `heatmaps-integration`. `master` only moves when syncing
upstream. `deploy` is fast-forwarded from `heatmaps-integration` once a build is
verified — never commit there directly.

Slash commands automate the recipes: `/sync-upstream`, `/release-deploy`.

## Commands

- Client dev: `cd client && npm run dev` (Next.js + Turbopack, port 3002)
- Server dev: `cd server && npm run dev`
- Docs dev: `cd docs && npm run dev` (port 3003)
- Typecheck: `cd client && npx tsc --noEmit` / `cd server && npx tsc --noEmit`
- Lint: `cd client && npm run lint`
- Build analytics scripts: `cd server && npm run build:analytics`
  (regenerates `server/public/script*.js` — commit if changed)
- Tests: `cd server && npm test` (vitest)

## Code conventions

- TypeScript strict mode throughout client and server
- Client: React functional components, minimal `useEffect`, dark mode default
- Frontend stack: Next.js, Tailwind, Shadcn UI, TanStack Query, Zustand, Luxon, Nivo
- Backend stack: Fastify, Drizzle ORM (Postgres), ClickHouse, Zod
- Naming: `camelCase` variables/functions, `PascalCase` components/types, `UPPER_SNAKE_CASE` constants
- Imports: external first, then internal; alphabetical within groups
- Error handling: try/catch with specific types; trust internal callers, validate at boundaries
- Do not add comments explaining what well-named code already says
- **Never run database migration scripts** (`db:push`, `db:migrate`, `db:drop`)

## Fork-specific guardrails

- When editing files listed in `FORK_PATCHES.md`, keep the patch surface small —
  prefer extracting new logic into fork-only files (e.g. `server/src/services/heatmap/`)
  over inline edits to upstream files
- Branding goes through `client/src/lib/brand.ts` (env-driven `BRAND_NAME`, `SHOW_FOOTER`).
  Do not hardcode brand strings in upstream files
- Coolify deployment uses `docker-compose.coolify.yml` (fork-only). Do not edit
  upstream's `docker-compose.yml`
- After any analytics-script change, run `npm run build:analytics` and commit
  the regenerated `server/public/script*.js` separately

## Claude local settings

- Project-wide Claude settings live in `.claude/settings.json` and may be committed when they are meant for the whole repo.
- Personal machine-specific overrides should go in `.claude/settings.local.json`.
- Keep `.claude/settings.local.json` out of git; use it for personal preferences, local permission overrides, and local hooks only.
- Do not move team-wide rules from `CLAUDE.md` into local settings.

## Memory and context

The fork's history and rationale lives in `FORK_PATCHES.md` and `docs/heatmaps-roadmap.md`.
Read those before proposing structural changes — they encode decisions that aren't
visible in `git log`.
