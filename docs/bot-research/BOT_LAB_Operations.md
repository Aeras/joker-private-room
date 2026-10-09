# JOKER Bot Lab operations

The laboratory uses the real canonical domain in isolated synthetic four-bot games. It does not write rooms, games, participant records, human statistics or live Realtime channels. Every admin request validates the existing HttpOnly PIN session and the immutable player UUID `a1f36a77-1732-44d4-8c3b-4623a6e6ed0c`. Names and host flags do not authorize access.

## Backend activation (not executed by this implementation)

1. Apply `20261009051533_joker_admin_bot_lab.sql` to the owner's external JOKER project `wubrgnzbvtrzbvvqalfw`. Existing pg_cron and pg_net are prerequisites.
2. Deploy the repository's `bot-lab` and `bot-lab-worker` Edge Functions with their checked-in import maps/configuration. The custom credentials are verified inside the functions/database; JWT verification is disabled for these two endpoints only.
3. After verifying both functions, explicitly enable `private.bot_lab_scheduler_config.enabled`. Its endpoint constraint accepts only the JOKER project. It starts disabled, so jobs cannot appear to progress before the worker is configured.
4. Publish the frontend separately, then test the authenticated admin and an ordinary player. No production migration, Edge deployment, scheduler activation or frontend publish was performed here.

One active job and one leased worker are allowed globally. Each invocation advances at most 32 canonical transitions / 500 ms, with the bounded final decision allowed to finish. Checkpoints, RNG cursor and results survive browser closure. Database dispatch continues completed chunks; a 10-second cron recovers lost dispatches or expired 60-second leases. Cancellation fences in-flight commits. Repeated invocation tokens, stale leases and duplicate game results cannot advance progress twice. A 14-day / 500,000-chunk job ceiling fails durably rather than inventing completion. Disable the scheduler switch to stop new claims.

10/100/1,000/5,000 are real game counts. Comparison mode executes twice that count: frozen baseline versus upgrading only lineup slot zero against unchanged opponents, with matched decks/seeds and four-seat/dealer rotation. Ten samples leave a partial final rotation; prefer larger counts for balanced estimates. Confidence intervals use independent seed clusters and are withheld below 30 seeds. Histograms give p50/p95/p99 **intervals**, not precise raw quantiles. Decision inspection is a bounded synthetic-game sample, not a complete replay or live hidden-card API.

## Verification evidence

Local disposable PostgreSQL-compatible PGlite loaded the actual existing session-validation function plus the new migration: 37 behavioral database assertions passed. A real worker/JSONB/database end-to-end run completed 10 mixed-tier Popular games, all 240 deals, 240 persisted chunks, zero errors/rejections; metrics contain 40 participations and 960 seat-deal observations. Measured chunk wall time including database IO: p50 63.69 ms, p95 156.98 ms, maximum 263.03 ms on local Windows/Bun. This is not production Edge capacity proof. CI separately uses disposable PostgreSQL 16 and type-checks both Edge dependency graphs with Deno.

JSONB sorts object keys. Competitive decision seeds normalize public card/semantic fields, and worker configuration equality is structural, preventing checkpoint recovery from changing strategy merely because the database reordered JSON keys.

Before production activation, verify actual Edge CPU/invocation cost, pg_net dispatch/cron recovery, browser-close continuation and cancellation on the external project. The 5,000-game option is bounded but has not been load-tested on production infrastructure.

The repository now includes scripts/bot-lab-db-e2e.ts. CI installs its pinned PGlite test dependency in the runner's temporary directory; it loads real migration/auth SQL and advances actual bounded worker chunks through JSONB. Normal mode validates 10 full games; --compare validates 20 full games and the matched-pair/seed denominators. Neither mode connects to production. Decision inspection retains the first and last ten decisions so endgame actions are included.
