import {describe,expect,it} from "vitest";
import {createBiribaLocalDeal} from "./localDeal";
describe("Biriba visual-test deal",()=>{
 for(const count of [2,4] as const)it(`deals unique cards for ${count} seats`,()=>{
  const d=createBiribaLocalDeal(count,()=>0.4);
  expect(d.hands).toHaveLength(count);
  expect(d.hands.every(h=>h.length===11)).toBe(true);
  expect(d.packets.map(p=>p.length)).toEqual([11,11]);
  expect(d.discard).toHaveLength(1);
  const cards=[...d.hands.flat(),...d.packets.flat(),...d.stock,...d.discard];
  expect(cards).toHaveLength(108);
  expect(new Set(cards.map(c=>c.id)).size).toBe(108);
 });
});