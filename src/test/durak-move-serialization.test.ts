import {
  recordDurakPlay,
  publicDurakEvents,
} from "../../supabase/functions/durak-commands/presentation";
import { durakAttackSeats } from "../../supabase/functions/durak-commands/engine";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  applyDurakMove,
  beginDurak,
  legalDurakMoves,
  sameDurakMove,
  type DurakMove,
} from "@/durak/engine";
import {
  sameDurakMove as serverSameMove,
  applyDurakMove as serverApply,
  beginDurak as serverBegin,
  legalDurakMoves as serverLegal,
} from "../../supabase/functions/durak-commands/engine";

// PostgreSQL jsonb reorders object fields; the server validator must compare values.
const card = { suit: "hearts", rank: 7 } as const;
function reordered(move: DurakMove): DurakMove {
  if (move.type === "defend")
    return {
      pair: move.pair,
      card: { rank: move.card.rank, suit: move.card.suit },
      type: move.type,
    };
  if ("card" in move)
    return { card: { rank: move.card.rank, suit: move.card.suit }, type: move.type };
  return move;
}
describe("DURAK move validation after JSONB persistence", () => {
  it("accepts the submitted attack through the real HTTP handler and saves it", async () => {
    const state = serverBegin("podkidnoy", 4, () => 0.5);
    state.hands = state.hands.map((hand) => hand.map((c) => ({ rank: c.rank, suit: c.suit })));
    const seat = state.primaryAttacker,
      first = state.hands[seat]![0]!;
    let handler: (req: Request) => Promise<Response> = async () => {
      throw Error("Handler not registered");
    };
    let saved = false;
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === "durak_room_command_internal")
          return {
            data: {
              ok: true,
              room: { seats: state.hands.map((_, index) => ({ index, occupant: "human" })) },
            },
            error: null,
          };
        if (args["p_action"] === "load")
          return { data: { ok: true, state, seat, revision: 1 }, error: null };
        if (args["p_action"] === "save") {
          saved = true;
          return { data: { ok: true, revision: 2 }, error: null };
        }
        throw Error("Unexpected RPC");
      },
    };
    // Execute the deployed entrypoint with isolated transport/auth fixtures only.
    const source = readFileSync("supabase/functions/durak-commands/index.ts", "utf8").replace(
      /^import .*;\r?\n/gm,
      "",
    );
    const js = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const execute = new Function(
      "Deno",
      "createClient",
      "beginDurak",
      "applyDurakMove",
      "legalDurakMoves",
      "sameDurakMove",
      "chooseDurakBotMove",
      "endDurakGame",
      "recordDurakPlay",
      "durakAttackSeats",
      "publicDurakEvents",
      js,
    );
    execute(
      {
        serve: (fn: typeof handler) => {
          handler = fn;
        },
        env: { get: () => "fixture" },
      },
      () => client,
      serverBegin,
      serverApply,
      serverLegal,
      serverSameMove,
      () => null,
      () => null,
      recordDurakPlay,
      durakAttackSeats,
      publicDurakEvents,
    );
    const response = await handler(
      new Request("https://fixture.invalid", {
        method: "POST",
        body: JSON.stringify({
          sessionToken: "a".repeat(64),
          action: "move",
          code: "ABC123",
          move: { type: "attack", card: { suit: first.suit, rank: first.rank } },
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(saved).toBe(true);
    expect(body.game.myHand).toHaveLength(5);
    expect(body.game.pairs[0].attack).toEqual(first);
    expect(body.game.revision).toBe(2);
    expect(body.game).not.toHaveProperty("hands");
    expect(body.game).not.toHaveProperty("pendingFinishOrder");
    state.ended = true;
    state.fool = 1;
    state.finishOrder = [3, 2, 0];
    state.finishOrderComplete = true;
    const finished = await handler(
      new Request("https://fixture.invalid", {
        method: "POST",
        body: JSON.stringify({ sessionToken: "a".repeat(64), action: "get_game", code: "ABC123" }),
      }),
    );
    expect(finished.status).toBe(200);
    const result = await finished.json();
    expect(result.game.finishOrder).toEqual([3, 2, 0]);
    expect(result.game.finishOrderComplete).toBe(true);
    expect(result.game.fool).toBe(1);
    expect(result.game).not.toHaveProperty("pendingFinishOrder");
  });
  it.each(["attack", "transfer", "defend"] as const)(
    "accepts %s independent of field order",
    (type) => {
      const move: DurakMove = type === "defend" ? { type, card, pair: 0 } : { type, card };
      expect(JSON.stringify(move)).not.toBe(JSON.stringify(reordered(move)));
      expect(serverSameMove(move, reordered(move))).toBe(true);
      expect(sameDurakMove(move, reordered(move))).toBe(true);
    },
  );
  it.each(["podkidnoy", "perevodnoy"] as const)(
    "accepts a real opening attack after persisted-state key reordering in %s",
    (variant) => {
      for (const [begin, legal, apply] of [
        [beginDurak, legalDurakMoves, applyDurakMove],
        [serverBegin, serverLegal, serverApply],
      ] as const) {
        const state = begin(variant, 4, () => 0.5);
        state.hands = state.hands.map((hand) => hand.map((c) => ({ rank: c.rank, suit: c.suit })));
        const seat = state.primaryAttacker;
        const option = legal(state, seat)[0]!;
        if (!("card" in option)) throw Error("Expected opening attack");
        // zod's client command emits suit before rank, unlike the persisted state.
        const submitted: DurakMove = {
          type: "attack",
          card: { suit: option.card.suit, rank: option.card.rank },
        };
        expect(JSON.stringify(option)).not.toBe(JSON.stringify(submitted));
        expect(legal(state, seat).some((m) => serverSameMove(m, submitted))).toBe(true);
        const result = apply(state, seat, submitted);
        expect(result.pairs[0]!.attack).toEqual(submitted.card);
        expect(result.hands[seat]!.length).toBe(state.hands[seat]!.length - 1);
      }
    },
  );
  it("still rejects different ranks, suits, action types and defense targets", () => {
    const move: DurakMove = { type: "defend", card, pair: 0 };
    const wrong: DurakMove[] = [
      { type: "defend", card: { ...card, rank: 8 }, pair: 0 },
      { type: "defend", card: { ...card, suit: "clubs" }, pair: 0 },
      { type: "defend", card, pair: 1 },
      { type: "attack", card },
      { type: "take" },
    ];
    for (const other of wrong) {
      expect(serverSameMove(move, other)).toBe(false);
      expect(sameDurakMove(move, other)).toBe(false);
    }
  });
  it.each(["take", "pass", "finish"] as const)("preserves %s validation", (type) => {
    expect(serverSameMove({ type }, { type })).toBe(true);
    expect(serverSameMove({ type }, { type: type === "take" ? "pass" : "take" })).toBe(false);
  });
});
