import {describe,expect,it} from "vitest";
import {beginBiribaMatch,biribaAction} from "./engine";
import type {BiribaCard,BiribaMeld,BiribaRank} from "./rules";
const c=(id:string,rank:number):BiribaCard=>({id,rank:rank as BiribaRank,suit:"spades"});
const meld=(cards:BiribaCard[],ownerSeat=0):BiribaMeld=>({ownerSeat,suit:"spades",highAce:false,cards:cards.map((card,i)=>({card,value:i+3}))});
describe("BIRIBA independent gameplay turn engine",()=>{
 it("deals one hand per seat and starts with draw phase",()=>{
  const m=beginBiribaMatch(4,()=>0.123456);
  expect(m.hands.map(h=>h.length)).toEqual([11,11,11,11]);
  expect(m.turn).toBe(0);expect(m.phase).toBe("draw");
 });
 it("requires drawing before discarding and rotates turns after discard",()=>{
  const m=beginBiribaMatch(2,()=>0.112);
  expect(()=>biribaAction(m,0,{type:"discard",id:m.hands[0]![0]!.id})).toThrow("MUST_DRAW_FIRST");
  const d=biribaAction(m,0,{type:"draw"});
  expect(d.hands[0]).toHaveLength(12);
  const n=biribaAction(d,0,{type:"discard",id:d.hands[0]![0]!.id});
  expect(n.turn).toBe(1);expect(n.phase).toBe("draw");expect(n.hands[0]).toHaveLength(11);
 });
 it("rejects a discard pickup unless a discarded card is melded immediately",()=>{
  const m=beginBiribaMatch(2,()=>0.112);
  const arr=[c("a",3),c("b",4),c("c",5)];
  m.hands[0]=arr;
  expect(()=>biribaAction(m,0,{type:"pickup",ids:[],meld:meld(arr)})).toThrow("PICKUP_REQUIRES_MELD");
 });
 it("rejects invalid cross-team extension",()=>{
  const m=beginBiribaMatch(4,()=>0.12);
  m.phase="meld";
  m.melds=[meld([c("a",3),c("b",4),c("c",5)],1)];
  m.hands[0]=[c("d",6)];
  expect(()=>biribaAction(m,0,{type:"extend",index:0, meld:meld([c("a",3),c("b",4),c("c",5),c("d",6)],1)})).toThrow("OPPONENT_MELD");
 });
});
