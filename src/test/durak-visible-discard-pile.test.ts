import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const load=(name:string)=>readFileSync(resolve(process.cwd(),name),"utf8");
describe("DURAK persistent discard pile",()=>{
 it("accumulates the actual public discarded-card count with face-down artwork",()=>{
  const pile=load("src/durak/DurakDiscardPile.tsx");
  expect(pile).toContain("Math.min(count,20)");
  expect(pile).toContain("<DurakCardBack/>");
  expect(pile).toContain("count} εκτός παιχνιδιού");
 });
 it("moves completed defense toward the measured pile destination and stays visible on landing",()=>{
  const table=load("src/durak/DurakOnlineTable.tsx");
  const style=load("src/durak/durakFullscreen.css");
  expect(table).toContain('querySelector("[data-durak-discard-pile] .durak-discard-mound")');
  expect(table).toContain("dest.left+dest.width/2");
  expect(table).toContain("<DurakDiscardPile count={game.discardCount}/>");
  expect(style).toContain("100% { transform: translate(var(--durak-clear-x), var(--durak-clear-y))");
  expect(style).toContain("scale(.84); opacity: 1;");
 });
});