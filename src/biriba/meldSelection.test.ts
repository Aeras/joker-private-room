import { describe, expect, it } from "vitest";
import { selectedBiribaMeld } from "./meldSelection";
import { biribaMeldDirty, type BiribaCard, type BiribaRank, type BiribaSuit } from "./rules";

const c = (id: string, rank: number, suit: BiribaSuit = "spades"): BiribaCard => ({ id, rank: rank as BiribaRank, suit });
const joker: BiribaCard = { id: "wild-joker", joker: true };
describe("Biriba selected melds with wildcard", () => {
  for (const wild of [c("wild-two", 2, "hearts"), joker]) {
    it(`fills interior 9 using ${wild.joker ? "joker" : "two"}`, () => {
      const meld = selectedBiribaMeld([c("jack",11), c("seven",7), wild, c("ten",10), c("eight",8)], 0);
      expect(meld?.cards.map(p => p.value)).toEqual([7,8,9,10,11]);
      expect(meld && biribaMeldDirty(meld)).toBe(true);
    });
    it("fills missing start and end", () => {
      expect(selectedBiribaMeld([c("eight",8), c("nine",9), wild],0)?.cards.map(p=>p.value)).toEqual([7,8,9]);
      expect(selectedBiribaMeld([wild, c("seven",7), c("eight",8)],0)?.cards.map(p=>p.value)).toEqual([7,8,9]);
    });
  }
  it("allows high Ace without a wildcard", () => {
    const meld = selectedBiribaMeld([c("ace",1),c("queen",12),c("king",13)],0);
    expect(meld?.highAce).toBe(true);
    expect(meld?.cards.map(p=>p.value)).toEqual([12,13,14]);
  });
  it("allows wildcard before high Ace", () => {
    const meld = selectedBiribaMeld([c("queen",12),c("ace",1),joker],0);
    expect(meld?.highAce).toBe(true);
    expect(meld?.cards.map(p=>p.value)).toEqual([12,13,14]);
  });
  it("allows natural two in an otherwise clean run", () => {
    const meld = selectedBiribaMeld([c("two",2),c("ace",1),c("three",3)],0);
    expect(meld && biribaMeldDirty(meld)).toBe(false);
  });
  it("rejects two wildcards or a gap greater than one", () => {
    expect(selectedBiribaMeld([joker,c("wild2",2,"hearts"),c("seven",7),c("ten",10)],0)).toBeNull();
    expect(selectedBiribaMeld([c("seven",7),c("ten",10),c("jack",11)],0)).toBeNull();
  });
});
