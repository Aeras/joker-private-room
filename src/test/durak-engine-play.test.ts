import { describe, expect, it } from "vitest";
import { applyDurakMove, beginDurak, legalDurakMoves } from "@/durak/engine";
import { chooseDurakBotMove } from "@/durak/bot";
describe("DURAK play engine, isolated from JOKER",()=>{
 it.each(["podkidnoy","perevodnoy"] as const)("deals six cards and fixes trump for %s",variant=>{
  const m=beginDurak(variant,4,()=>0.3);
  expect(m.hands.map(h=>h.length)).toEqual([6,6,6,6]);
  expect(m.deck).toHaveLength(12);
  expect(m.trump).toBe(m.trumpCard.suit);
  expect(m.pairs).toHaveLength(0);
 });
 it("runs legal attacks and rejects playing another player's card",()=>{
  const m=beginDurak("podkidnoy",2,()=>0.4);
  const first=legalDurakMoves(m,m.attacker).find(x=>x.type==="attack");
  expect(first?.type).toBe("attack");
  if(!first)throw Error("missing attack");
  const next=applyDurakMove(m,m.attacker,first);
  expect(next.pairs).toHaveLength(1);
  expect(next.hands[m.attacker]).toHaveLength(5);
  expect(()=>applyDurakMove(m,m.defender,first)).toThrow("ILLEGAL_DURAK_MOVE");
  expect(legalDurakMoves(next,m.defender).some(x=>x.type==="take")).toBe(true);
 });
 it("bots always choose legal DURAK moves",()=>{
  const m=beginDurak("perevodnoy",4,()=>0.14);
  const bot=chooseDurakBotMove(m,m.attacker,"tactical");
  expect(bot).not.toBeNull();
  expect(legalDurakMoves(m,m.attacker)).toContainEqual(bot);
 });
 it("does not allow transfer in classic variant",()=>{
  const m=beginDurak("podkidnoy",2,()=>0.5);
  const attack=legalDurakMoves(m,m.attacker).find(x=>x.type==="attack");
  if(!attack)throw Error("missing attack");
  const next=applyDurakMove(m,m.attacker,attack);
  expect(legalDurakMoves(next,m.defender).filter(x=>x.type==="transfer")).toHaveLength(0);
 });
});
