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
 it("accepts a high Ace after King when extending an existing run",()=>{
  const m=beginBiribaMatch(2,()=>0.12);
  m.phase="meld";
  const ace=c("ace-high",1);
  m.hands[0]=[ace,c("spare",7)];
  m.melds=[{ownerSeat:0,suit:"spades",highAce:false,cards:[
    {card:c("jack",11),value:11},{card:c("queen",12),value:12},{card:c("king",13),value:13}
  ]}];
  const extended={...m.melds[0]!,highAce:true,cards:[...m.melds[0]!.cards,{card:ace,value:14}]};
  const n=biribaAction(m,0,{type:"extend",index:0,meld:extended});
  expect(n.melds[0]?.cards.map(p=>p.value)).toEqual([11,12,13,14]);
  expect(n.melds[0]?.highAce).toBe(true);
 });
 it("collects the 11-card packet immediately after melding the last three cards",()=>{
  const m=beginBiribaMatch(2,()=>0.12);
  m.phase="meld";
  const last=[c("last-3",3),c("last-4",4),c("last-5",5)];
  m.hands[0]=last;
  const packetIds=m.packets[0]!.map(card=>card.id);
  const n=biribaAction(m,0,{type:"meld",meld:meld(last)});
  expect(n.packetTaken[0]).toBe(true);
  expect(n.packetPlayed[0]).toBe(true);
  expect(n.hands[0]!.map(card=>card.id)).toEqual(packetIds);
  expect(n.phase).toBe("meld");
  expect(n.turn).toBe(0);
  expect(n.roundEnded).toBe(false);
 });
 it("collects a packet after discarding the final card without an existing biriba",()=>{
  const m=beginBiribaMatch(2,()=>0.12);
  m.phase="meld";
  m.hands[0]=[c("last-card",8)];
  const n=biribaAction(m,0,{type:"discard",id:"last-card"});
  expect(n.packetTaken[0]).toBe(true);
  expect(n.hands[0]).toHaveLength(11);
  expect(n.pendingPacket[0]).toBe(0);
  expect(n.turn).toBe(1);
 });
 it("refuses to wrap a low Ace run into a high Ace run",()=>{
  const m=beginBiribaMatch(2,()=>0.12);
  m.phase="meld";
  m.hands[0]=[c("king",13)];
  m.melds=[{ownerSeat:0,suit:"spades",highAce:false,cards:[
    {card:c("ace-low",1),value:1},{card:c("two",2),value:2},{card:c("three",3),value:3}
  ]}];
  const wrong={...m.melds[0]!,highAce:true,cards:[...m.melds[0]!.cards,{card:c("king",13),value:14}]};
  expect(()=>biribaAction(m,0,{type:"extend",index:0,meld:wrong})).toThrow();
 });
});
