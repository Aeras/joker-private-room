import { describe, expect, it } from "vitest";
import { beginBiribaMatch, biribaAction } from "../../supabase/functions/biriba-commands/engine";
import { recordBiribaPublicActions } from "../../supabase/functions/biriba-commands/presentation";
import {
  newDiscardFromPublicActions,
  newMeldCardsFromPublicActions,
  publicActionsSince,
} from "./biribaVisualModel";
import type { BiribaCard, BiribaMeld } from "./rules";

const card = (id: string, rank: number): BiribaCard => ({ id, suit: "hearts", rank: rank as 3 });
const meld = (cards: BiribaCard[], ownerSeat: number): BiribaMeld => ({
  ownerSeat,
  suit: "hearts",
  highAce: false,
  cards: cards.map((value, index) => ({ card: value, value: index + 3 })),
});

describe("Biriba public action journal", () => {
  it("records only a publicly played discard, never the card drawn from the stock", () => {
    const initial = beginBiribaMatch(2, () => 0.123);
    const drawn = biribaAction(initial, 0, { type: "draw" });
    const afterDraw = recordBiribaPublicActions(initial, drawn, 0);
    expect(afterDraw.publicActions).toEqual([]);
    const hiddenId = drawn.hands[0]!.at(-1)!.id;
    const discarded = biribaAction(afterDraw, 0, { type: "discard", id: drawn.hands[0]![0]!.id });
    const recorded = recordBiribaPublicActions(afterDraw, discarded, 0);
    expect(recorded.publicActions).toEqual([
      {
        sequence: 1,
        round: 1,
        actorSeat: 0,
        kind: "discard",
        cards: [drawn.hands[0]![0]],
      },
    ]);
    expect(JSON.stringify(recorded.publicActions)).not.toContain(hiddenId);
  });

  it("preserves order and actors through multiple moves committed in one revision", () => {
    const initial = beginBiribaMatch(4, () => 0.456);
    const a = [card("a3", 3), card("a4", 4), card("a5", 5)];
    const b = [card("b3", 3), card("b4", 4), card("b5", 5)];
    const one = recordBiribaPublicActions(
      initial,
      {
        ...initial,
        melds: [meld(a, 1)],
      },
      1,
    );
    const two = recordBiribaPublicActions(
      one,
      {
        ...one,
        melds: [...one.melds, meld(b, 2)],
      },
      2,
    );
    const three = recordBiribaPublicActions(
      two,
      {
        ...two,
        discards: [...two.discards, card("d7", 7)],
      },
      2,
    );
    const previous = {
      ...initial,
      seat: 0,
      revision: 4,
      stockCount: 30,
      handCounts: [11, 11, 11, 11],
      packetCounts: [11, 11],
    };
    const next = {
      ...three,
      seat: 0,
      revision: 5,
      stockCount: 30,
      handCounts: [11, 8, 8, 11],
      packetCounts: [11, 11],
    };
    expect(
      publicActionsSince(previous, next).map(({ sequence, actorSeat, kind }) => [
        sequence,
        actorSeat,
        kind,
      ]),
    ).toEqual([
      [1, 1, "meld"],
      [2, 2, "meld"],
      [3, 2, "discard"],
    ]);
    expect(
      newMeldCardsFromPublicActions(previous, next).map(({ card, actorSeat }) => [
        card.id,
        actorSeat,
      ]),
    ).toEqual([
      ["a3", 1],
      ["a4", 1],
      ["a5", 1],
      ["b3", 2],
      ["b4", 2],
      ["b5", 2],
    ]);
    expect(newDiscardFromPublicActions(previous, next)).toMatchObject({
      card: { id: "d7" },
      actorSeat: 2,
    });
    expect(publicActionsSince(next, next)).toEqual([]);
    expect(publicActionsSince(null, next)).toEqual([]);
  });

  it("fast-forwards safely when events are missing or a new round begins", () => {
    const base = beginBiribaMatch(2, () => 0.789);
    const previous = {
      ...base,
      seat: 0,
      revision: 1,
      stockCount: 30,
      handCounts: [11, 11],
      packetCounts: [11, 11],
    };
    const gap = {
      ...previous,
      revision: 3,
      publicActionSequence: 3,
      publicActions: [
        {
          sequence: 3,
          round: 1,
          actorSeat: 1,
          kind: "discard" as const,
          cards: [card("x", 7)],
        },
      ],
    };
    expect(publicActionsSince(previous, gap)).toEqual([]);
    expect(newDiscardFromPublicActions(previous, gap)).toBeNull();
    expect(publicActionsSince(previous, { ...gap, roundNumber: 2 })).toEqual([]);
  });

  it("bounds persisted history while keeping a monotonic sequence for missed-update detection", () => {
    let state = beginBiribaMatch(2, () => 0.234);
    for (let index = 0; index < 140; index++) {
      state = recordBiribaPublicActions(state, {
        ...state,
        discards: [...state.discards, card(`public-${index}`, 7)],
      }, index % 2);
    }
    expect(state.publicActionSequence).toBe(140);
    expect(state.publicActions).toHaveLength(128);
    expect(state.publicActions?.[0]?.sequence).toBe(13);
  });
});
