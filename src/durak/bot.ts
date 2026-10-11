import { legalDurakMoves, type DurakMatch, type DurakMove } from "./engine";
import type { DurakCard } from "./rules";

/** DURAK-only tactical heuristics. No dependency on JOKER cards, scoring or bots. */
export type DurakBotLevel="casual"|"balanced"|"tactical";
const value=(card:DurakCard,trump:DurakMatch["trump"])=>(card.suit===trump?25:0)+card.rank;
export function chooseDurakBotMove(m:DurakMatch,seat:number,level:DurakBotLevel="balanced"):DurakMove|null{
 const moves=legalDurakMoves(m,seat);
 if(!moves.length)return null;
 const cards=m.hands[seat]!;
 const stock=m.deck.length;
 const score=(move:DurakMove):number=>{
  if(move.type==="attack"){
   const sameRank=cards.filter(c=>c.rank===move.card.rank).length;
   const trumpCost=move.card.suit===m.trump?23:0;
   return 90-value(move.card,m.trump)+sameRank*(level==="tactical"?7:3)-trumpCost
     +(m.taking?20:0);
  }
  if(move.type==="defend"){
   const trumpUsed=move.card.suit===m.trump;
   const coversLowWithTrump=trumpUsed&&m.pairs[move.pair]!.attack.suit!==m.trump;
   return 95-value(move.card,m.trump)-(coversLowWithTrump&&stock>4?30:0)
       +(level==="tactical"&&cards.length<=2?20:0);
  }
  if(move.type==="transfer"){
   const keepTrump=move.card.suit===m.trump;
   const recipient=(seat+1)%m.hands.length;
   return 110-(keepTrump?37:0)+(m.hands[recipient]!.length<4?-25:0);
  }
  if(move.type==="take"){
   const cheapestDefense=moves.filter(x=>x.type==="defend").map(x=>x.card);
   const onlyHighTrumps=cheapestDefense.length>0&&cheapestDefense.every(c=>c.suit===m.trump&&c.rank>=11);
   return cheapestDefense.length===0?95:onlyHighTrumps&&stock>6?80:0;
  }
  if(move.type==="finish")return m.pairs.every(p=>p.defense)?45:20;
  if(move.type==="pass")return 10;
  return 0;
 };
 const ordered=[...moves].sort((a,b)=>score(b)-score(a));
 if(level==="casual"&&ordered.length>1)return ordered[Math.min(1,ordered.length-1)]!;
 return ordered[0]!;
}
