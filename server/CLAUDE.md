# CLAUDE.md – Rybbit Server

Guidance for Claude Code when working in `/server`.

## Commands

- `npm run dev` – Compile + start (`tsc && node dist/index.js`)
- `npm run dev:cluster` – Same, but cluster mode
- `npm run build` – Full build (`tsc && build:analytics`)
- `npm run build:analytics` – Rebuild only `public/script*.js` from `src/analytics-script/`
- `npx tsc --noEmit` – Typecheck without emit
- `npm test` / `npm run test:run` – Vitest
- `npm run knip` – Detect unused exports/files
- **Never run `db:push`, `db:migrate`, `db:drop`, `db:generate`** — schema changes go through reviewed migrations only

## Stack

- **Framework**: Fastify (HTTP), running under Node.js with `"type": "module"` (ESM)
- **Postgres**: Drizzle ORM (`src/db/postgres/`), better-auth tables alongside app tables
- **ClickHouse**: official `@clickhouse/client` (`src/db/clickhouse/`) — analytics, sessions, replay, heatmap
- **Auth**: better-auth with admin, organization, emailOTP, apiKey, SSO plugins
- **Validation**: Zod schemas at API boundaries
- **Storage**: Cloudflare R2 via `@aws-sdk/client-s3` with custom checksum-stripping HTTP handler
- **Compression**: `@mongodb-js/zstd` (level 3) for replay event batches
- **Geolocation**: `@maxmind/geoip2-node` with bundled `GeoLite2-City.mmdb`
- **Email**: `@react-email/components` rendered via Resend
- **Logging**: Pino (`@fastify/one-line-logger` in dev, Axiom in prod)
- **Tests**: Vitest

## Project structure

```
src/
├── analytics-script/       # Tracking script source (compiled to public/script*.js)
├── api/                    # HTTP route handlers, one folder per domain
│   ├── analytics/          # Analytics queries (the bulk of the API)
│   ├── admin/              # Admin operations
│   ├── heatmap/            # Heatmap endpoints (FORK)
│   ├── sessionReplay/      # Replay ingest + retrieval
│   ├── sites/              # Site CRUD
│   ├── stripe/             # Billing webhooks (cloud only)
│   ├── teams/              # Org/team management
│   ├── uptime/             # Uptime monitoring
│   └── memberAccess/       # Org membership checks
├── db/
│   ├── postgres/           # Drizzle schema + client
│   ├── clickhouse/         # ClickHouse client + DDL
│   └── geolocation/        # GeoIP wrapper
├── services/               # Business logic, called from api/ handlers
│   ├── heatmap/            # Click extraction + querying (FORK)
│   ├── replay/             # Session replay ingest
│   ├── storage/            # R2 storage adapter
│   ├── sessions/           # Session bookkeeping
│   ├── tracker/            # Event ingest pipeline
│   ├── userId/             # Anonymous fingerprint generation
│   ├── uptime/             # Uptime checks
│   └── pdfReports/, weekyReports/, reengagement/  # Background jobs
├── lib/                    # Cross-cutting helpers (siteConfig, env, etc.)
├── types/                  # Shared TypeScript types
├── cluster.ts              # Cluster entrypoint
├── index.ts                # Single-process entrypoint + route registry
└── utils.ts, utils.test.ts
```

## Layering

Routes (`api/`) are thin: parse params → call service → return. Business logic lives
in `services/`. Database access is one further layer down — services own SQL/ClickHouse
queries, routes never touch the DB directly.

ClickHouse tables and DDL are defined in `src/db/clickhouse/clickhouse.ts`. The file
runs `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on
startup — additive migrations only, no destructive changes.

## Code conventions

- ESM imports use `.js` extension even for `.ts` source files (TS compiler requirement)
- Use Zod at request boundaries; trust types internally
- Async/await everywhere; no callbacks
- Errors: throw typed errors, let Fastify's error handler format the response
- Logging via the request-scoped `request.log` or the global pino instance
- Heavy queries should use ClickHouse's parameterized query syntax, never string interpolation
- ClickHouse: prefer `JSONEachRow` insert format and `processResults` for SELECT result parsing

## Fork notes

This server has fork-only additions. Read `../FORK_PATCHES.md` first. Specifically:

- `services/heatmap/clickExtractionService.ts` — extracted from `replay/sessionReplayIngestService.ts`
  to keep the upstream file diff small. New click-extraction logic goes here, not inline.
- `api/heatmap/` — entirely fork-only routes; safe to extend
- `db/clickhouse/clickhouse.ts` — fork adds `session_replay_clicks` table + a few ALTERs.
  Keep new DDL append-only (no DROPs) so upstream sync stays clean
- `services/storage/r2StorageService.ts:23` — `IS_CLOUD &&` gate is upstream's; the
  R2-self-host work plans to remove that one line (see FORK_PATCHES.md §E)

Whenever you change `src/analytics-script/`, run `npm run build:analytics` and commit
the regenerated `public/script*.js` as a separate commit.
