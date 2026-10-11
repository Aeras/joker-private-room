import { describe, expect, it } from "vitest";
import { applyDurakMove, beginDurak, legalDurakMoves, type DurakMatch } from "@/durak/engine";
import type { DurakVariant } from "@/durak/rules";

function scenario(variant:DurakVariant, players=2):DurakMatch {
 const m=beginDurak(variant,players,()=>0.37);
 m.hands[0]=[{suit:"clubs",rank:6},{suit:"diamonds",rank:9}];
 m.hands[1]=[{suit:"clubs",rank:8},{suit:"hearts",rank:10}];
 if(players>2)m.hands[2]=[{suit:"spades",rank:9}];
 m.deck=[{suit:"spades",rank:7},{suit:"diamonds",rank:7},{suit:"hearts",rank:7},{suit:"clubs",rank:7}];
 m.trump="hearts";m.trumpCard={suit:"hearts",rank:7};
 m.attacker=0;m.primaryAttacker=0;m.defender=1;m.defenderStartingHand=m.hands[1]!.length;
 m.pairs=[];m.firstAttack=false;m.passes=[];m.finishes=[];m.taking=false;m.ended=false;
 return m;
}
describe("DURAK defender next-round attack handoff",()=>{
 it.each(["podkidnoy","perevodnoy"] as const)("successful defense starts next attack in %s",variant=>{
   let m=scenario(variant);
   m=applyDurakMove(m,0,{type:"attack",card:{suit:"clubs",rank:6}});
   m=applyDurakMove(m,1,{type:"defend",pair:0,card:{suit:"clubs",rank:8}});
   m=applyDurakMove(m,0,{type:"finish"});
   expect(m.round).toBe(2);
   expect(m.primaryAttacker).toBe(1);
   expect(m.defender).toBe(0);
   expect(legalDurakMoves(m,1).some(x=>x.type==="attack")).toBe(true);
 });
 it.each(["podkidnoy","perevodnoy"] as const)("defender who takes is skipped in %s",variant=>{
   let m=scenario(variant);
   m=applyDurakMove(m,0,{type:"attack",card:{suit:"clubs",rank:6}});
   m=applyDurakMove(m,1,{type:"take"});
   m=applyDurakMove(m,0,{type:"finish"});
   expect(m.round).toBe(2);
   expect(m.primaryAttacker).toBe(0);
   expect(m.defender).toBe(1);
 });
 it("requires both adjacent attackers to finish before promoting the defender",()=>{
   let m=scenario("podkidnoy",3);
   m=applyDurakMove(m,0,{type:"attack",card:{suit:"clubs",rank:6}});
   m=applyDurakMove(m,1,{type:"defend",pair:0,card:{suit:"clubs",rank:8}});
   m=applyDurakMove(m,0,{type:"finish"});
   expect(m.round).toBe(1);
   m=applyDurakMove(m,2,{type:"finish"});
   expect(m.round).toBe(2);
   expect(m.primaryAttacker).toBe(1);
   expect(m.defender).toBe(2);
 });
});
