import {biribaAction,type BiribaMatch} from "./engine.ts";
import {biribaTeamOf,type BiribaCard,type BiribaMeld,type BiribaSuit} from "./rules.ts";
/** Only the acting bot hand and public melds are examined. No cheating via partner/opponent cards. */
export function chooseBiribaBotStep(match:BiribaMatch,seat:number,tier:1|2|3):BiribaMatch{
 if(match.roundEnded||match.turn!==seat)return match;
 if(match.phase==="draw")return biribaAction(match,seat,{type:"draw"});
 if(match.phase!=="meld")return match;
 const hand=match.hands[seat]??[];
 if(!hand.length)return match;
 const natural=hand.filter((c):c is Extract<BiribaCard,{joker?:false}>=>!c.joker);
 const sequences:BiribaMeld[]=[];
 for(const suit of ["clubs","diamonds","hearts","spades"] as BiribaSuit[]){
  const same=[...natural.filter(c=>c.suit===suit)].sort((a,b)=>a.rank-b.rank);
  for(let start=0;start<same.length;start++){
   const run=[same[start]!];
   for(let i=start+1;i<same.length;i++){
    if(same[i]!.rank===run[run.length-1]!.rank+1)run.push(same[i]!);
    else if(same[i]!.rank>run[run.length-1]!.rank+1)break;
   }
   if(run.length>=3)sequences.push({ownerSeat:seat,suit,highAce:false,
    cards:run.map(c=>({card:c,value:c.rank}))});
  }
 }
 // Tier 3 prefers longer sets and removes isolated high-value cards later.
 if(sequences.length){
  sequences.sort((a,b)=>b.cards.length-a.cards.length);
  const best=tier===1?sequences[sequences.length-1]!:sequences[0]!;
  try{return biribaAction(match,seat,{type:"meld",meld:best});}catch{/* do not force invalid move */}
 }
 const team=biribaTeamOf(seat,match.seats);
 for(let i=0;i<match.melds.length;i++){
  const m=match.melds[i]!;
  if(biribaTeamOf(m.ownerSeat,match.seats)!==team)continue;
  if(m.ownerSeat!==seat&&!match.opened[seat])continue;
  const lo=m.cards[0]!.value,hi=m.cards[m.cards.length-1]!.value;
  const atStart=natural.find(c=>c.suit===m.suit&&c.rank===lo-1);
  const atEnd=natural.find(c=>c.suit===m.suit&&c.rank===hi+1);
  const chosen=atEnd??atStart;
  if(chosen){
   const newCards=atEnd?[...m.cards,{card:chosen,value:chosen.rank}]:[{card:chosen,value:chosen.rank},...m.cards];
   try{return biribaAction(match,seat,{type:"extend",index:i, meld:{...m,cards:newCards}});}catch{/* legal action filters */}
  }
 }
 const sorted=[...hand].sort((a,b)=>{
  const score=(c:BiribaCard)=>c.joker?100:c.rank===2?75:c.rank===1?60:c.rank>=11?c.rank+10:c.rank;
  return score(a)-score(b);
 });
 const throwAway=tier===1?sorted[sorted.length-1]!:sorted[0]!;
 try{return biribaAction(match,seat,{type:"discard",id:throwAway.id});}catch{return match;}
}
