const root = process.env.BOT_LAB_PGLITE_ROOT;
if (!root) throw Error("Set BOT_LAB_PGLITE_ROOT to an isolated test dependency directory");
const { PGlite } = await import(root + "/dist/index.js");
const { pgcrypto } = await import(root + "/dist/contrib/pgcrypto.js");
import fs from "node:fs/promises";
import { runLabWorkerChunk } from "@/server/botLab/worker";
const db = new PGlite({ extensions: { pgcrypto } });
try {
  for (const f of [
    "supabase/tests/bot-lab/setup.sql",
    "supabase/migrations/20261003173620_jk001_phase1_fix_session_validation_ambiguity.sql",
    "supabase/migrations/20261009051533_joker_admin_bot_lab.sql",
  ])
    await db.exec(await fs.readFile(f, "utf8"));
  await db.exec("update private.bot_lab_scheduler_config set enabled=true");
  const compare = process.argv.includes("--compare");
  const expected = compare ? 20 : 10;
  const cfg = { games: 10, seed: 810000, ruleset: "popular", lineup: null, compare };
  const job = (
    await db.query(`select public.bot_lab_admin_internal($1,'create',$2::jsonb) j`, [
      "a".repeat(64),
      JSON.stringify({ requestId: crypto.randomUUID(), config: cfg }),
    ])
  ).rows[0].j;
  const repo = {
    claim: async (token) =>
      (await db.query("select public.claim_bot_lab_internal($1::uuid) j", [token])).rows[0].j,
    commit: async (i) =>
      (
        await db.query(
          "select public.commit_bot_lab_chunk_internal($1::uuid,$2::uuid,$3,$4::jsonb,$5::jsonb,$6) ok",
          [
            i.jobId,
            i.leaseToken,
            i.gameIndex,
            i.checkpoint ? JSON.stringify(i.checkpoint) : null,
            i.result ? JSON.stringify(i.result) : null,
            i.error,
          ],
        )
      ).rows[0].ok,
  };
  const times = [];
  let chunks = 0;
  for (; chunks < 3000; chunks++) {
    const current = (
      await db.query(
        "select status,completed_games,last_error from private.bot_lab_jobs where id=$1",
        [job.id],
      )
    ).rows[0];
    if (current.status === "completed") break;
    if (current.status === "failed") throw Error(JSON.stringify(current));
    const token = (await db.query("select token from private.bot_lab_invocations limit 1")).rows[0]
      ?.token;
    if (!token) throw Error("No durable dispatch token");
    const start = performance.now();
    await runLabWorkerChunk(repo, token);
    times.push(performance.now() - start);
  }
  if (chunks === 3000) throw Error("E2E chunk bound");
  const stats = (
    await db.query("select public.bot_lab_stats_internal($1,$2::uuid) r", ["a".repeat(64), job.id])
  ).rows[0].r;
  if (
    stats.completedGames !== expected ||
    stats.groups.reduce((n, g) => n + Number(g.participations), 0) !== expected * 4
  )
    throw Error("Stats denominator");
  const bids = stats.groups.reduce(
    (n, g) => n + Object.values(g.exactByDealSize).reduce((a, b) => a + Number(b.deals), 0),
    0,
  );
  if (bids !== expected * 96) throw Error("Canonical 24 deal stats");
  if (
    compare &&
    (stats.comparison.matchedGames !== 10 ||
      stats.comparison.independentSeeds !== 3 ||
      stats.comparison.approximate95ScoreCI !== null)
  )
    throw Error("Matched comparison denominator/CI");
  times.sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        completed: expected,
        chunks,
        canonicalDeals: bids / 4,
        errors: stats.errors,
        p50ChunkMs: times[Math.floor(times.length * 0.5)],
        p95ChunkMs: times[Math.floor(times.length * 0.95)],
        maxChunkMs: times.at(-1),
        statistics: stats,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error({ message: e.message, where: e.where, detail: e.detail });
  process.exitCode = 1;
} finally {
  await db.close();
}
