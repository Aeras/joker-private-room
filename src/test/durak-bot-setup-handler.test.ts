import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { beginDurak } from "../../supabase/functions/durak-commands/engine";
import { startDurakDeal } from "../../supabase/functions/durak-commands/bot-turn";
import {
  CANONICAL_BOTS,
  deterministicBotOrder,
} from "../../supabase/functions/_shared/bot-catalog";

function fixture() {
  const rpc = vi.fn(async (name: string) => ({
    error: null,
    data:
      name === "durak_room_command_internal"
        ? { ok: true, room: { variant: "podkidnoy", capacity: 4, version: 7 } }
        : { ok: true, updated: true, started: true },
  }));
  let handler = async (_req: Request) => new Response();
  const source = readFileSync("supabase/functions/durak-commands/index.ts", "utf8").replace(
    /^import .+;\r?$/gm,
    "",
  );
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function(
    "Deno",
    "createClient",
    "CANONICAL_BOTS",
    "deterministicBotOrder",
    "beginDurak",
    "startDurakDeal",
    js,
  )(
    {
      serve: (fn: typeof handler) => {
        handler = fn;
      },
      env: { get: () => "fixture" },
    },
    () => ({ rpc }),
    CANONICAL_BOTS,
    deterministicBotOrder,
    beginDurak,
    startDurakDeal,
  );
  return {
    rpc,
    send: (data: Record<string, unknown>) =>
      handler(
        new Request("https://fixture.invalid", {
          method: "POST",
          body: JSON.stringify({ sessionToken: "a".repeat(64), code: "ABC123", ...data }),
        }),
      ),
  };
}
it("passes only the trusted catalog and requested seat/ID for selection", async () => {
  const f = fixture();
  expect(
    (
      await f.send({
        action: "bot_add",
        seat: 3,
        botId: "thomoulis",
        catalog: [{ id: "fake" }],
        name: "fake",
      })
    ).status,
  ).toBe(200);
  expect(f.rpc).toHaveBeenCalledWith("durak_lobby_setup_internal", {
    p_session_token: "a".repeat(64),
    p_room_code: "ABC123",
    p_action: "bot_add",
    p_catalog: CANONICAL_BOTS,
    p_seat: 3,
    p_bot_id: "thomoulis",
    p_state: null,
  });
});
it("rejects an unknown bot or invalid seat before accessing storage", async () => {
  const f = fixture();
  for (const data of [
    { botId: "fake", seat: 1 },
    { botId: "thomoulis", seat: 9 },
  ]) {
    expect((await f.send({ action: "bot_add", ...data })).status).toBe(400);
  }
  expect(f.rpc).not.toHaveBeenCalled();
});
it("starts through one atomic auto-fill transaction with the real engine deal", async () => {
  const f = fixture();
  expect((await f.send({ action: "start" })).status).toBe(200);
  const calls = f.rpc.mock.calls as unknown as Array<
    [
      string,
      {
        p_catalog?: unknown;
        p_state?: { hands: unknown[][]; dealReadyAt: number; dealStartedAt: number };
      },
    ]
  >;
  const setup = calls.find(([name]) => name === "durak_lobby_setup_internal")![1];
  expect(setup.p_catalog).toEqual(
    deterministicBotOrder({
      roomCode: "ABC123",
      actionId: "durak-start",
      expectedRoomVersion: 7,
      rulesVersion: "durak-v1",
    }),
  );
  expect(setup.p_state!.hands.map((hand) => hand.length)).toEqual([6, 6, 6, 6]);
  expect(setup.p_state!.dealReadyAt - setup.p_state!.dealStartedAt).toBe(7950);
  expect(calls.filter(([name]) => name === "durak_lobby_setup_internal")).toHaveLength(1);
});
