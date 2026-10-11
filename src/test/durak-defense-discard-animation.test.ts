import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DURAK_CLEAR_MS } from "@/durak/useDurakPresentation";

const presentation=readFileSync(resolve(process.cwd(),"src/durak/useDurakPresentation.ts"),"utf8");
const table=readFileSync(resolve(process.cwd(),"src/durak/DurakOnlineTable.tsx"),"utf8");
const css=readFileSync(resolve(process.cwd(),"src/durak/durakFullscreen.css"),"utf8");

describe("DURAK successful-defense discard presentation",()=>{
 it("holds the visible defended cards until the discard animation finishes",()=>{
   expect(DURAK_CLEAR_MS).toBe(760);
   expect(presentation).toContain("previous.pairs.every(pair => Boolean(pair.defense))");
   expect(presentation).toContain("incoming.pairs.length === 0");
   expect(presentation).toContain("upcoming.round > visibleRound.round");
   expect(presentation).toContain("clearedRound.current");
 });
 it("uses real card backs during the flip without changing the game reducer",()=>{
   expect(table).toContain("data-durak-clearing={clearing || undefined}");
   expect(table).toContain("durak-clearing-card-back");
   expect(table).toContain("<DurakCardBack />");
   expect(css).toContain("@keyframes durak-bout-discard");
   expect(css).toContain("@keyframes durak-bout-show-back");
   expect(css).toContain("prefers-reduced-motion");
 });
});
