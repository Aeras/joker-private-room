import { describe, expect, it } from "vitest";
import { cardForArtwork } from "@/durak/DurakTableVisuals";
import { createDeck } from "@/durak/rules";

describe("DURAK standalone card rendering adapter",()=>{
  it("renders all 36 DURAK cards using existing artwork paths",()=>{
    const converted=createDeck().map(cardForArtwork);
    expect(converted).toHaveLength(36);
    expect(new Set(converted.map(c=>c.id)).size).toBe(36);
    expect(converted.every(c=>c.kind==="standard")).toBe(true);
  });
  it("supports the two black sixes not used in JOKER's popular deck",()=>{
    expect(cardForArtwork({suit:"clubs",rank:6})).toMatchObject({kind:"standard",rank:"6",suit:"clubs"});
    expect(cardForArtwork({suit:"spades",rank:6})).toMatchObject({kind:"standard",rank:"6",suit:"spades"});
  });
});
