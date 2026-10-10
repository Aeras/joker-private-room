import { describe, expect, it } from "vitest";
import { beats, canThrowIn, canTransfer, createDeck, DURAK_SEAT_POSITIONS, maximumAttackCards } from "@/durak/rules";

describe("isolated DURAK game rules", () => {
  it("uses 36 unique cards", () => {
    const cards = createDeck();
    expect(cards).toHaveLength(36);
    expect(new Set(cards.map(c => `${c.suit}-${c.rank}`)).size).toBe(36);
  });
  it("limits only the first attack to five and subsequent attacks to the defender starting hand", () => {
    expect(maximumAttackCards(10, true)).toBe(5);
    expect(maximumAttackCards(10, false)).toBe(10);
    expect(maximumAttackCards(4, true)).toBe(4);
  });
  it("covers with higher suit or trump but not lower", () => {
    expect(beats({suit:"spades",rank:9},{suit:"spades",rank:11},"hearts")).toBe(true);
    expect(beats({suit:"spades",rank:9},{suit:"hearts",rank:6},"hearts")).toBe(true);
    expect(beats({suit:"hearts",rank:10},{suit:"spades",rank:14},"hearts")).toBe(false);
  });
  it("throws in only existing ranks", () => {
    expect(canThrowIn({suit:"clubs",rank:10},[{suit:"spades",rank:10}])).toBe(true);
    expect(canThrowIn({suit:"clubs",rank:11},[{suit:"spades",rank:10}])).toBe(false);
  });
  it("allows transfer only before any defense, with sufficient receiving hand", () => {
    const cards = [{suit:"spades" as const,rank:8 as const}];
    const transfer={suit:"clubs" as const,rank:8 as const};
    expect(canTransfer("perevodnoy",transfer,cards,false,2,true)).toBe(true);
    expect(canTransfer("perevodnoy",transfer,cards,true,2,true)).toBe(false);
    expect(canTransfer("perevodnoy",transfer,cards,false,1,true)).toBe(false);
    expect(canTransfer("podkidnoy",transfer,cards,false,2,true)).toBe(false);
  });
  it("keeps the human player at bottom in every layout", () => {
    for (let n=2;n<=6;n++) {
      expect(DURAK_SEAT_POSITIONS[n]).toHaveLength(n);
      expect(DURAK_SEAT_POSITIONS[n][0]).toBe("bottom");
    }
  });
});
