// Real isolated PostgreSQL/RLS/transactions; simulated Supabase JWT helpers and Broadcast sink.
const assert = require("assert"),
  fs = require("fs");
const { PGlite } = require(
  process.argv[2] ? require("path").resolve(process.argv[2]) : "@electric-sql/pglite",
);
(async () => {
  const db = new PGlite();
  const results = [];
  const q = async (sql) => (await db.query(sql)).rows;
  const game = "00000000-0000-4000-8000-000000000201",
    player = "00000000-0000-4000-8000-000000000401",
    session = "00000000-0000-4000-8000-000000000301",
    nextSession = "00000000-0000-4000-8000-000000000302",
    topic = "joker:v1:" + game + ":" + session;
  await db.exec(
    fs
      .readFileSync("src/demo/realtimeSqlFixture.ts", "utf8")
      .split("String.raw`")[1]
      .split("`;")[0],
  );
  await db.exec(fs.readFileSync("docs/realtime-sql/proposed-setup.sql", "utf8"));
  await db.exec(
    "insert into public.players values('" +
      player +
      "',true); insert into public.games values('" +
      game +
      '\',1,\'active\',\'{"hands":"secret","deck":"future"}\'); insert into public.game_participants values(\'' +
      game +
      "','" +
      player +
      "','human','active'); insert into private.player_sessions values('" +
      session +
      "','" +
      player +
      "',sha256(convert_to(repeat('a',64),'UTF8')),now()+interval '1 day',true,null);",
  );
  assert.equal((await q("select count(*)::int n from realtime.messages"))[0].n, 0);
  results.push("disabled-default: PASS");
  await db.exec("update private.joker_realtime_config set enabled=true,jwt_issuer='test-issuer';");
  const authorized = (
    await q("select public.authorize_joker_realtime_internal(repeat('a',64),'" + game + "') a")
  )[0].a;
  assert.deepEqual(Object.keys(authorized).sort(), ["expiresAt", "playerId", "sessionId"]);
  assert.equal(authorized.playerId, player);
  assert.equal(
    (await q("select public.authorize_joker_realtime_internal(repeat('b',64),'" + game + "') a"))[0]
      .a,
    null,
  );
  results.push("broker-valid/invalid-session: PASS");
  await db.exec("update public.games set state_version=2 where id='" + game + "';");
  let rows = await q("select * from realtime.messages");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].topic, topic);
  assert.equal(rows[0].private, true);
  assert.deepEqual(Object.keys(rows[0].payload).sort(), [
    "emittedAt",
    "gameId",
    "kind",
    "protocol",
    "stateVersion",
  ]);
  assert(!JSON.stringify(rows).includes("secret"));
  results.push("sanitized-authoritative-update: PASS");
  await db.exec("begin; update public.games set state_version=3; rollback;");
  assert.equal((await q("select count(*)::int n from realtime.messages"))[0].n, 1);
  assert.equal((await q("select state_version::int v from public.games"))[0].v, 2);
  results.push("transaction-rollback: PASS");
  await db.exec("update public.games set state_version=state_version;");
  assert.equal((await q("select count(*)::int n from realtime.messages"))[0].n, 1);
  results.push("same-version-replay: PASS");
  const claims = {
    iss: "test-issuer",
    sub: player,
    role: "authenticated",
    aud: "authenticated",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 90,
    jkr_scope: "receive",
    jkr_game_id: game,
    jkr_session_id: session,
    jkr_topic: topic,
  };
  const asClient = async (c = claims, t = topic) => {
    await db.exec("reset role;");
    await db.query(
      "select set_config('request.jwt.claims',$1,false),set_config('realtime.topic',$2,false)",
      [JSON.stringify(c), t],
    );
    await db.exec("set role authenticated;");
  };
  await asClient();
  assert.equal((await q("select count(*)::int n from realtime.messages"))[0].n, 1);
  await assert.rejects(() =>
    db.exec("insert into realtime.messages values('" + topic + "','broadcast','{}',true)"),
  );
  await assert.rejects(() => q("select * from public.games"));
  await assert.rejects(() => q("select * from private.player_sessions"));
  await assert.rejects(() =>
    q("select public.authorize_joker_realtime_internal(repeat('a',64),'" + game + "')"),
  );
  results.push("receive-only/raw-table/RPC-denial: PASS");
  await asClient(claims, "other");
  assert.equal((await q("select count(*)::int n from realtime.messages"))[0].n, 0);
  await asClient({ ...claims, jkr_session_id: nextSession });
  assert.equal((await q("select count(*)::int n from realtime.messages"))[0].n, 0);
  await asClient({ ...claims, iss: "wrong-issuer" });
  assert.equal((await q("select count(*)::int n from realtime.messages"))[0].n, 0);
  await asClient({ ...claims, exp: 0 });
  assert.equal((await q("select count(*)::int n from realtime.messages"))[0].n, 0);
  await asClient(claims, "");
  assert.equal((await q("select count(*)::int n from realtime.messages"))[0].n, 0);
  results.push("wrong-topic/session/expired/direct-history: PASS");
  await db.exec(
    "reset role; create policy overly_broad_receive on realtime.messages for select to authenticated using(true); create policy overly_broad_send on realtime.messages for insert to authenticated with check(true);",
  );
  await asClient(claims, "other");
  assert.equal((await q("select count(*)::int n from realtime.messages"))[0].n, 0);
  await asClient();
  await assert.rejects(() =>
    db.exec("insert into realtime.messages values('" + topic + "','presence','{}',true)"),
  );
  results.push("permissive-policy-bypass-blocked: PASS");
  await db.exec(
    "reset role; update private.player_sessions set revoked_at=now(),active_control=false; update public.games set state_version=3;",
  );
  assert.equal((await q("select count(*)::int n from realtime.messages"))[0].n, 1);
  await asClient();
  assert.equal((await q("select count(*)::int n from realtime.messages"))[0].n, 0);
  await db.exec("reset role;");
  assert.equal(
    (await q("select public.authorize_joker_realtime_internal(repeat('a',64),'" + game + "') a"))[0]
      .a,
    null,
  );
  results.push("revocation-stops-join-and-emission: PASS");
  await db.exec(
    "insert into private.player_sessions values('" +
      nextSession +
      "','" +
      player +
      "',sha256(convert_to(repeat('b',64),'UTF8')),now()+interval '1 day',true,null); update public.games set state_version=4;",
  );
  rows = await q("select * from realtime.messages");
  assert.equal(rows.length, 2);
  assert.equal(rows[1].topic, "joker:v1:" + game + ":" + nextSession);
  results.push("takeover-new-topic: PASS");
  await db.exec(
    "select set_config('test.broadcast_failure','true',false); update public.games set state_version=5; select set_config('test.broadcast_failure','false',false);",
  );
  assert.equal((await q("select state_version::int v from public.games"))[0].v, 5);
  assert.equal((await q("select count(*)::int n from realtime.messages"))[0].n, 2);
  results.push("broadcast-failure-does-not-reject-move: PASS");
  await db.exec(
    "begin; update public.games set state_version=6,lifecycle='complete'; update private.player_sessions set revoked_at=now(),active_control=false; update public.game_participants set status='completed'; commit;",
  );
  rows = await q("select * from realtime.messages");
  assert.equal(rows.length, 3);
  assert.equal(rows[2].payload.kind, "game_closed");
  results.push("host-end-terminal-order: PASS");
  await db.exec(fs.readFileSync("docs/realtime-sql/proposed-rollback.sql", "utf8"));
  assert.equal((await q("select to_regclass('private.joker_realtime_config') x"))[0].x, null);
  results.push("rollback-script: PASS");
  fs.writeFileSync(
    ".test-tmp/realtime-sql-results.json",
    JSON.stringify(
      {
        database: "isolated PGlite",
        transport: "simulated Supabase helpers/Broadcast sink",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
  await db.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
