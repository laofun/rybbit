# R2 storage for self-hosted Rybbit (fork)

Upstream Rybbit ships with Cloudflare R2 support but gates it behind `IS_CLOUD`,
so self-hosted instances always store session-replay event batches in ClickHouse.
This fork removes the gate (one line in `server/src/services/storage/r2StorageService.ts`)
so any deployment with R2 credentials can offload replay payloads to R2.

This document is the operator's guide. The code change is tracked in `FORK_PATCHES.md` §E.

## When to enable R2

R2 helps when session-replay storage in ClickHouse becomes uncomfortable:

- **You record long sessions or many sessions per day.** Replay events are the
  largest analytics payload by far — typical traffic is several MB per active
  session-minute *before* compression.
- **You want cheap long-term storage.** R2 is ~$0.015/GB-month with zero egress;
  ClickHouse on your own disk is your storage cost.
- **You don't need R2 if** you have plenty of ClickHouse disk and a TTL that
  matches your retention requirements. ClickHouse-only is simpler.

You can leave R2 disabled and turn it on later — the code path is symmetric:
batches written before R2 was enabled keep replaying from ClickHouse, batches
written after go to R2. There is no migration step.

## Cloudflare R2 setup

1. **Create a bucket.** Cloudflare Dashboard → R2 → Create bucket.
   Name it whatever; the default in this fork is `rybbit`. Pick the location hint
   nearest your Coolify host.

2. **Generate an API token** with R2 read+write scoped to that bucket only:
   - Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create API token
   - Permissions: `Object Read & Write`
   - Bucket: select your bucket (do not grant account-wide access)
   - TTL: leave as forever, or rotate yearly per your policy
   - Save the **Access Key ID** and **Secret Access Key** immediately — Cloudflare
     only shows the secret once.

3. **Find your account ID.** Cloudflare Dashboard → R2 → any bucket → "S3 API"
   panel. The endpoint looks like `<accountId>.r2.cloudflarestorage.com`.

4. **Add a lifecycle rule** to delete old objects. This is **required** to keep
   storage bounded. The rule must be **≥ the ClickHouse `session_replay_events`
   TTL** (default `INTERVAL 30 DAY`) — otherwise ClickHouse keeps a pointer
   `event_data_key` that no longer resolves and replay playback breaks for that
   session.
   - R2 Dashboard → your bucket → Settings → Object lifecycle rules → Add rule
   - Action: "Delete"
   - Expire after: at minimum **30 days** (match or exceed the ClickHouse TTL —
     adding ~7 days of slack avoids edge cases at the boundary)
   - Apply to: all objects (or scope to a prefix like `1/` if you only want one site)

   If you change the ClickHouse `session_replay_events` TTL (in `server/src/db/clickhouse/clickhouse.ts`),
   update the R2 lifecycle rule to match.

## Coolify configuration

The `docker-compose.coolify.yml` already wires the four R2 env vars into the
backend service. Set them in Coolify → your service → Environment Variables:

| Variable | Required | Example |
|---|---|---|
| `R2_ACCOUNT_ID` | yes | `abc123def456...` (32 hex chars from Cloudflare) |
| `R2_ACCESS_KEY_ID` | yes | from the API token created above |
| `R2_SECRET_ACCESS_KEY` | yes | from the API token created above (mark as Secret) |
| `R2_BUCKET_NAME` | no, defaults to `rybbit` | the bucket name you picked |

If `R2_ACCESS_KEY_ID` or `R2_SECRET_ACCESS_KEY` is empty, R2 stays disabled and
events keep going to ClickHouse only — same behaviour as upstream self-host.

## Verify it's working

1. Restart the backend after setting the env vars.
2. In the backend logs, look for: `R2Storage initialized` (info level) — that
   confirms the env vars were picked up and the S3 client constructed.
3. Trigger a session recording on any tracked site (open a page with the tracker
   script for >10s with mouse movement).
4. After the next batch flush, check the bucket: keys are organized as
   `<siteId>/<sessionId>/<timestamp>.json.zst`. The presence of any object means
   the path is live.
5. Open the corresponding session in the Rybbit replay UI — playback exercises
   the `getBatch` retrieval path. Successful playback means the round-trip works.

If `R2Storage initialized` does not appear, double-check the four env vars are
non-empty in the running container (`docker exec ... env | grep R2_`). If
playback fails with a corrupted-data error after enabling R2, check that the
lifecycle rule isn't deleting objects faster than ClickHouse expects.

## What R2 does not store

R2 only holds replay event batches. Every other piece of data — analytics
events, session metadata, click coordinates for heatmaps, user tables, etc. —
stays in ClickHouse and Postgres. You can take a full Rybbit backup without
touching R2; the worst case from R2 loss is replay playback failing for the
sessions whose batches lived only in R2.
