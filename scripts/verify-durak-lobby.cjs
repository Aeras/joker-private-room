const { PGlite } = require(process.argv[2] || "@electric-sql/pglite");
const fs = require("fs");
const assert = require("assert");
(async () => {
  const db = new PGlite();
  await db.exec(
    `create schema private;create schema extensions;create role anon;create role authenticated;create role service_role;create table public.players(id uuid primary key);create function public.validate_player_session_internal(token text) returns table(id uuid) language sql as 'select id from players where id::text=token';`,
  );
  for (const p of [
    "20261011011000_durak_isolated_rooms.sql",
    "20261011074500_durak_authoritative_game.sql",
    "20261011140947_durak_named_bot_seats_autofill.sql",
  ])
    await db.exec(fs.readFileSync("supabase/migrations/" + p, "utf8"));
  const host = "00000000-0000-0000-0000-000000000001",
    guest = "00000000-0000-0000-0000-000000000002";
  await db.query("insert into players values ($1),($2)", [host, guest]);
  const ts = require("typescript"),
    path = require("path");
  function loadTS(file) {
    const out = {};
    const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function("exports", "require", js)(out, (p) =>
      loadTS(path.resolve(path.dirname(file), p.endsWith(".ts") ? p : p + ".ts")),
    );
    return out;
  }
  const catalog = loadTS("supabase/functions/_shared/bot-catalog.ts").CANONICAL_BOTS;
  const { beginDurak } = loadTS("src/durak/engine.ts");
  async function rpc(code, action, seat = null, bot = null, state = null, token = host) {
    return (
      await db.query("select durak_lobby_setup_internal($1,$2,$3,$4,$5,$6,$7) result", [
        token,
        code,
        action,
        JSON.stringify(catalog),
        seat,
        bot,
        state ? JSON.stringify(state) : null,
      ])
    ).rows[0].result;
  }
  let checks = 0;
  for (let n = 2; n <= 6; n++)
    for (const variant of ["podkidnoy", "perevodnoy"]) {
      const code = "QA" + n + (variant === "podkidnoy" ? "P" : "T") + "00";
      const id = (
        await db.query(
          "insert into durak_rooms(code,host_player_id,variant,capacity) values($1,$2,$3,$4) returning id",
          [code, host, variant, n],
        )
      ).rows[0].id;
      for (let seat = 0; seat < n; seat++)
        await db.query(
          "insert into durak_room_seats(room_id,seat_index,occupant_type,player_id) values($1,$2,$3,$4)",
          [id, seat, seat === 0 ? "human" : "empty", seat === 0 ? host : null],
        );
      assert.equal((await rpc(code, "bot_add", 1, catalog[3].id, null, guest)).code, "HOST_ONLY");
      checks++;
      assert.equal((await rpc(code, "bot_add", 0, catalog[3].id)).code, "INVALID_BOT");
      checks++;
      assert.equal((await rpc(code, "bot_add", 1, catalog[3].id)).ok, true);
      checks++;
      if (n > 2) {
        assert.equal((await rpc(code, "bot_add", 2, catalog[3].id)).code, "BOT_UNAVAILABLE");
        checks++;
        await db.query(
          "update durak_room_seats set occupant_type='human',player_id=$1 where room_id=$2 and seat_index=2",
          [guest, id],
        );
      }
      assert.equal(
        (await rpc(code, "start", null, null, { variant, hands: [], ended: false })).code,
        "INVALID_STATE",
      );
      checks++;
      const result = await rpc(
        code,
        "start",
        null,
        null,
        beginDurak(variant, n, () => 0.31),
      );
      assert.equal(result.started, true);
      checks++;
      const seats = (
        await db.query("select * from durak_room_seats where room_id=$1 order by seat_index", [id])
      ).rows;
      assert.equal(seats[0].player_id, host);
      assert.equal(seats[1].bot_display_name, catalog[3].displayName);
      if (n > 2) assert.equal(seats[2].player_id, guest);
      assert.equal(seats.filter((s) => s.occupant_type === "empty").length, 0);
      const bots = seats.filter((s) => s.occupant_type === "bot");
      assert.equal(new Set(bots.map((s) => s.bot_id)).size, bots.length);
      checks++;
      assert.equal(
        (await rpc(code, "start", null, null, { variant, hands: Array(n).fill([]), ended: false }))
          .code,
        "HOST_ONLY",
      );
      checks++;
    }
  assert.equal(
    (await rpc("INVALID", "start", null, null, null, "invalid")).code,
    "NOT_AUTHENTICATED",
  );
  checks++;
  await db.exec("set role anon");
  try {
    await rpc("QA2P00", "start");
    throw Error("public execution allowed");
  } catch (e) {
    assert.match(e.message, /permission denied/);
  }
  checks++;
  await db.exec("reset role");
  console.log(
    JSON.stringify({
      sqlChecks: checks,
      variants: 2,
      playerCounts: [2, 3, 4, 5, 6],
      authorization: true,
      duplicateSelection: true,
      humansPreserved: true,
      selectedBotsPreserved: true,
      autofill: true,
    }),
  );
  await db.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
