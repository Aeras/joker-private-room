import { describe, expect, it } from "vitest";
import { beginBiribaMatch } from "../../supabase/functions/biriba-commands/engine";
import { recoverUnclaimedBiribaPacket } from "../../supabase/functions/biriba-commands/recoverPacket";

describe("legacy Biriba packet recovery", () => {
  for (const seats of [2, 4] as const)
    for (let seat = 0; seat < seats; seat++) {
      it(`repairs active seat ${seat} in a ${seats}-player game exactly once`, () => {
        const match = beginBiribaMatch(seats, () => 0.12);
        const team = seats === 2 ? seat : seat % 2;
        match.turn = seat;
        match.phase = "meld";
        match.hands[seat] = [];
        match.opened[seat] = true;
        match.teamScores = [135, 240];
        const packetIds = match.packets[team]!.map((card) => card.id);
        const before = {
          melds: structuredClone(match.melds),
          scores: [...match.teamScores],
          stock: structuredClone(match.stock),
          otherHands: match.hands.map((hand, index) =>
            index === seat ? null : structuredClone(hand),
          ),
          turn: match.turn,
          clock: structuredClone(match.clock),
        };
        const fixed = recoverUnclaimedBiribaPacket(match);
        expect(fixed).not.toBe(match);
        expect(fixed.hands[seat]!.map((card) => card.id)).toEqual(packetIds);
        expect(fixed.packets[team]).toEqual([]);
        expect(fixed.packetTaken[team]).toBe(true);
        expect(fixed.packetPlayed[team]).toBe(true);
        expect(fixed.packetOwner[team]).toBe(seat);
        expect(fixed.pendingPacket[team]).toBeNull();
        expect({
          melds: fixed.melds,
          scores: fixed.teamScores,
          stock: fixed.stock,
          otherHands: fixed.hands.map((hand, index) => (index === seat ? null : hand)),
          turn: fixed.turn,
          clock: fixed.clock,
        }).toEqual(before);
        expect(recoverUnclaimedBiribaPacket(fixed)).toBe(fixed);
      });
    }
  it("refuses ambiguous or already resolved states", () => {
    const base = beginBiribaMatch(4, () => 0.12);
    base.phase = "meld";
    base.hands[0] = [];
    base.opened[0] = true;
    const mutations = [
      (m: typeof base) => {
        m.phase = "draw";
      },
      (m: typeof base) => {
        m.roundEnded = true;
      },
      (m: typeof base) => {
        m.roundScored = true;
      },
      (m: typeof base) => {
        m.matchFinished = true;
      },
      (m: typeof base) => {
        m.opened[0] = false;
      },
      (m: typeof base) => {
        m.packetTaken[0] = true;
      },
      (m: typeof base) => {
        m.packetPlayed[0] = true;
      },
      (m: typeof base) => {
        m.packetOwner[0] = 0;
      },
      (m: typeof base) => {
        m.pendingPacket[0] = 0;
      },
      (m: typeof base) => {
        m.forcedDiscardSeat = 0;
      },
      (m: typeof base) => {
        m.packets[0]!.pop();
      },
      (m: typeof base) => {
        m.hands[0] = [m.stock[0]!];
      },
      (m: typeof base) => {
        m.stock.push(m.packets[0]![0]!);
      },
      (m: typeof base) => {
        m.turn = 1;
      },
    ];
    for (const mutate of mutations) {
      const candidate = structuredClone(base);
      mutate(candidate);
      expect(recoverUnclaimedBiribaPacket(candidate)).toBe(candidate);
    }
  });
});
