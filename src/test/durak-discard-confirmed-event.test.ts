import { describe, expect, it } from "vitest";
import { beginDurak, applyDurakMove } from "@/durak/engine";
import {
  recordDurakPlay,
  publicDurakEvents,
} from "../../supabase/functions/durak-commands/presentation";
const card = { suit: "clubs", rank: 6 } as const,
  defense = { suit: "clubs", rank: 7 } as const;
describe("DURAK public resolved-bout events", () => {
  it.each([false, true])("records non-card closure with confirmed outcome; taking=%s", (taking) => {
    const before = beginDurak("podkidnoy", 2, () => 0.3);
    before.deck = [];
    before.hands = [[{ suit: "spades", rank: 8 }], [{ suit: "spades", rank: 9 }]];
    before.primaryAttacker = 0;
    before.defender = 1;
    before.firstAttack = false;
    before.defenderStartingHand = 2;
    before.pairs = [{ attack: card, defense }];
    before.taking = taking;
    const move = { type: "finish" } as const;
    const after = applyDurakMove(before, 0, move);
    const result = recordDurakPlay(before, after, 0, move);
    const event = result.presentationEvents!.at(-1)!;
    expect(event.kind).toBe(taking ? "take" : "discard");
    expect(event.discardCount).toBe(taking ? 0 : 2);
    expect(event.pairs).toEqual(before.pairs);
    expect(event).not.toHaveProperty("hands");
    expect(event).not.toHaveProperty("deck");
    expect(event).not.toHaveProperty("myHand");
  });
  it("records the last played card then the official successful closure in sequence", () => {
    const before = beginDurak("podkidnoy", 2, () => 0.3);
    before.deck = [];
    before.hands = [[], [defense]];
    before.primaryAttacker = 0;
    before.defender = 1;
    before.finishes = [];
    before.firstAttack = false;
    before.pairs = [{ attack: card }];
    const move = { type: "defend", card: defense, pair: 0 } as const;
    const after = applyDurakMove(before, 1, move);
    const result = recordDurakPlay(before, after, 1, move);
    expect(result.presentationEvents!.map((e) => e.kind)).toEqual(["defend", "discard"]);
    expect(result.presentationSequence).toBe(2);
    expect(after.ended).toBe(true);
    expect(result.presentationEvents![1]!.discardCount).toBe(2);
    expect(publicDurakEvents(result, 2).map((e) => e.kind)).toEqual(["defend", "discard"]);
    for (const version of [undefined, 1, "2", null]) {
      expect(publicDurakEvents(result, version).map((e) => e.kind)).toEqual(["defend"]);
      expect(publicDurakEvents(result, version)[0]!.sequence).toBe(1);
    }
    expect(result.presentationSequence).toBe(2); // History is never mutated for legacy clients.
  });
});
