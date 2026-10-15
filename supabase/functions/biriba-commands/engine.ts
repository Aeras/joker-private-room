import {startBiribaClock,nextBiribaClock,type BiribaClock} from "./clock.ts";
import {BIRIBA_PACKET_SIZE,biribaCanFinish,biribaMeldValid,biribaTeamOf,type BiribaCard,type BiribaMeld,type BiribaSeatCount,type BiribaSuit,type BiribaTarget} from "./rules.ts";
import {createBiribaLocalDeal} from "./localDeal.ts";

/** Deterministic, serializable BIRIBA match state. Authoritative persistence is separate. */
export type BiribaTurnPhase="draw"|"meld"|"ended";
export type BiribaRoundHistory={round:number;teamTotals:[number,number];breakdown:Array<{cards:number;bonuses:number;closing:number;penalty:number;held:number;total:number}>;playerPoints:Array<{seat:number;cards:number;held:number}>};
export type BiribaMatch={
 seats:BiribaSeatCount;hands:BiribaCard[][];packets:BiribaCard[][];
 stock:BiribaCard[];discards:BiribaCard[];trump:BiribaSuit|null;
 initialJokerId:string|null;melds:BiribaMeld[];turn:number;phase:BiribaTurnPhase;
 opened:boolean[];packetTaken:boolean[];packetPlayed:boolean[];packetOwner:(number|null)[];
 pendingPacket:(number|null)[];forcedDiscardSeat:number|null;roundEnded:boolean;closedBy:number|null;clock:BiribaClock;
 target:BiribaTarget;timerEnabled:boolean;roundNumber:number;teamScores:[number,number];scoreHistory:BiribaRoundHistory[];roundScored:boolean;matchFinished:boolean;winnerTeam:number|null;
};
export type BiribaAction=
 |{type:"draw"}
 |{type:"pickup";ids:string[];meld:BiribaMeld;index?:number}
 |{type:"meld";meld:BiribaMeld}
 |{type:"extend";index:number;meld:BiribaMeld}
 |{type:"discard";id:string};
const copy=(m:BiribaMatch):BiribaMatch=>structuredClone(m);
export function beginBiribaMatch(seats:BiribaSeatCount,random:()=>number=Math.random,target:BiribaTarget=5000):BiribaMatch{
 const d=createBiribaLocalDeal(seats,random);
 return {seats,hands:d.hands,packets:[...d.packets],stock:d.stock,discards:d.discard,
  trump:d.trump,initialJokerId:d.discard[0]?.joker?d.discard[0].id:null,melds:[],
  turn:0,phase:"draw",opened:Array(seats).fill(false),packetTaken:[false,false],
  packetPlayed:[false,false],packetOwner:[null,null],pendingPacket:[null,null],forcedDiscardSeat:null,
  roundEnded:false,closedBy:null,clock:startBiribaClock(seats,Date.now()),
  target,timerEnabled:true,roundNumber:1,teamScores:[0,0],scoreHistory:[],roundScored:false,matchFinished:false,winnerTeam:null};
}
export function biribaAction(m:BiribaMatch,seat:number,action:BiribaAction):BiribaMatch{
 if(m.roundEnded||seat!==m.turn||m.phase==="ended")throw new Error("NOT_YOUR_TURN");
 const next=copy(m), hand=next.hands[seat]!, team=biribaTeamOf(seat,next.seats);
 const takeIds=(ids:readonly string[]):BiribaCard[]=>{
  if(new Set(ids).size!==ids.length)throw new Error("DUPLICATE_CARDS");
  const found=ids.map(id=>hand.find(c=>c.id===id));
  if(found.some(c=>!c))throw new Error("CARD_NOT_OWNED");
  // The client may choose card IDs and requested values, but must never
  // substitute different rank/suit/Joker metadata for a real physical card.
  ids.forEach(id=>hand.splice(hand.findIndex(c=>c.id===id),1));
  return found as BiribaCard[];
 };
 const verifyCards=(cards:readonly {card:BiribaCard}[],prior:readonly BiribaMeld[]=[]):void=>{
  const canonical=[...hand,...next.discards,...prior.flatMap(m=>m.cards.map(p=>p.card))];
  for(const placement of cards){
   const found=canonical.find(c=>c.id===placement.card.id);
   if(!found||JSON.stringify(found)!==JSON.stringify(placement.card))throw new Error("SPOOFED_CARD");
  }
 };
 const assessEmpty=()=>{
  if(hand.length!==0||next.packetTaken[team])return;
  if(next.packets[team]?.length!==BIRIBA_PACKET_SIZE||next.packetOwner[team]!==null||
     next.pendingPacket[team]!==null||next.packetPlayed[team])throw new Error("INVALID_PACKET_STATE");
  // The first packet is collected when the hand is emptied, independently
  // of the biriba requirements for closing the round.
  next.packetTaken[team]=true;next.packetOwner[team]=seat;
  next.hands[seat]=next.packets[team]!.splice(0);
  if(next.phase==="meld")next.packetPlayed[team]=true;
  else next.pendingPacket[team]=seat;
 };
 if(action.type==="draw"){
  if(next.phase!=="draw")throw new Error("DRAW_ALREADY_DONE");
  if(next.pendingPacket[team]===seat){
   next.pendingPacket[team]=null;next.packetPlayed[team]=true;
  }
  const top=next.stock.pop();
  if(!top)throw new Error("EMPTY_STOCK");
  const mustOnlyDiscard=hand.length===0&&!next.melds.some(md=>biribaTeamOf(md.ownerSeat,next.seats)===team&&md.cards.length>=7);
  hand.push(top);next.phase="meld";next.forcedDiscardSeat=mustOnlyDiscard?seat:null;return next;
 }
 if(action.type==="pickup"){
  if(next.phase!=="draw")throw new Error("DRAW_ALREADY_DONE");
  if(!next.discards.length)throw new Error("EMPTY_DISCARDS");
  const pile=next.discards.splice(0);
  hand.push(...pile);
  verifyCards(action.meld.cards,next.melds);
  if(!biribaMeldValid(action.meld))throw new Error("INVALID_MELD");
  let additions=action.meld.cards;
  if(action.index!==undefined){
    const previous=next.melds[action.index];
    if(!previous||previous.suit!==action.meld.suit||(!previous.highAce&&action.meld.highAce&&!previous.cards.some(p=>p.value===1)&&action.meld.cards.at(-1)?.value===14?false:previous.highAce!==action.meld.highAce)
      ||previous.ownerSeat!==action.meld.ownerSeat)throw new Error("INVALID_EXTENSION");
    if(biribaTeamOf(previous.ownerSeat,next.seats)!==team)throw new Error("OPPONENT_MELD");
    if(previous.ownerSeat!==seat&&!next.opened[seat])throw new Error("MUST_OPEN_OWN_MELD_FIRST");
    const old=new Set(previous.cards.map(p=>p.card.id));
    if(!previous.cards.every(p=>action.meld.cards.some(c=>c.card.id===p.card.id)))throw new Error("CANNOT_REMOVE_CARDS");
    for(const p of previous.cards){
      if(!p.card.joker&&p.card.rank===2&&p.value===2 &&
         action.meld.cards.find(x=>x.card.id===p.card.id)?.value!==2)throw new Error("NATURAL_TWO_FIXED");
    }
    additions=action.meld.cards.filter(p=>!old.has(p.card.id));
  }else if(action.meld.ownerSeat!==seat)throw new Error("INVALID_OWNER");
  if(!additions.some(p=>pile.some(c=>c.id===p.card.id)))throw new Error("PICKUP_REQUIRES_MELD");
  if(additions.length===0)throw new Error("NO_ADDITION");
  takeIds(additions.map(p=>p.card.id));
  if(action.index!==undefined)next.melds[action.index]=action.meld;
  else{next.melds.push(action.meld);next.opened[seat]=true;}
  if(next.initialJokerId&&additions.some(p=>p.card.id===next.initialJokerId))next.trump=action.meld.suit;
  next.phase="meld";assessEmpty();return next;
 }
 if(action.type==="meld"){
  if(next.forcedDiscardSeat===seat)throw new Error("MUST_DISCARD_DRAWN_CARD");
  if(next.phase!=="meld"||!biribaMeldValid(action.meld))throw new Error("INVALID_MELD");
  if(action.meld.ownerSeat!==seat)throw new Error("INVALID_OWNER");
  verifyCards(action.meld.cards,next.melds);
  const ids=action.meld.cards.map(p=>p.card.id);
  takeIds(ids);next.melds.push(action.meld);next.opened[seat]=true;
  assessEmpty();return next;
 }
 if(action.type==="extend"){
  if(next.forcedDiscardSeat===seat)throw new Error("MUST_DISCARD_DRAWN_CARD");
  if(next.phase!=="meld")throw new Error("MUST_DRAW_FIRST");
  const previous=next.melds[action.index];
  if(!previous||!biribaMeldValid(action.meld)||previous.suit!==action.meld.suit||(!previous.highAce&&action.meld.highAce&&!previous.cards.some(p=>p.value===1)&&action.meld.cards.at(-1)?.value===14?false:previous.highAce!==action.meld.highAce)||previous.ownerSeat!==action.meld.ownerSeat)throw new Error("INVALID_EXTENSION");
  if(biribaTeamOf(previous.ownerSeat,next.seats)!==team)throw new Error("OPPONENT_MELD");
  if(previous.ownerSeat!==seat&&!next.opened[seat])throw new Error("MUST_OPEN_OWN_MELD_FIRST");
  const oldIds=new Set(previous.cards.map(p=>p.card.id));
  if(!previous.cards.every(p=>action.meld.cards.some(x=>x.card.id===p.card.id)))throw new Error("CANNOT_REMOVE_CARDS");
  // Natural twos never turn into a wildcard; Joker replacements may move only inside same meld.
  for(const p of previous.cards){
   if(!p.card.joker&&p.card.rank===2&&p.value===2){
    const now=action.meld.cards.find(x=>x.card.id===p.card.id);
    if(now?.value!==2)throw new Error("NATURAL_TWO_FIXED");
   }
  }
  verifyCards(action.meld.cards,next.melds);
  const additions=action.meld.cards.filter(p=>!oldIds.has(p.card.id));
  if(!additions.length)throw new Error("NO_ADDITION");
  takeIds(additions.map(p=>p.card.id));
  next.melds[action.index]=action.meld;assessEmpty();return next;
 }
 if(action.type==="discard"){
  if(next.phase!=="meld")throw new Error("MUST_DRAW_FIRST");
  const index=hand.findIndex(c=>c.id===action.id);
  if(index<0)throw new Error("CARD_NOT_OWNED");
  const endsHand=hand.length===1;
  const eligible=next.packetTaken[team]&&next.packetPlayed[team]&&biribaCanFinish(
   next.melds.filter(md=>biribaTeamOf(md.ownerSeat,next.seats)===team),true,true);
  if(endsHand&&next.packetTaken[team]&&!eligible)throw new Error("CANNOT_FINISH_WITHOUT_BIRIBAS");
  if(next.forcedDiscardSeat===seat&&hand.length!==1)throw new Error("MUST_DISCARD_DRAWN_CARD");
  next.discards.push(hand.splice(index,1)[0]!);
  next.forcedDiscardSeat=null;
  if(endsHand&&eligible){next.closedBy=team;next.roundEnded=true;next.phase="ended";return next;}
  next.phase="draw";
  if(!next.packetTaken[team])assessEmpty();
  if(next.stock.length===0){next.roundEnded=true;next.phase="ended";return next;}
  next.turn=(seat+1)%next.seats;
  next.clock=nextBiribaClock(next.clock,Date.now());
  return next;
 }
 throw new Error("UNKNOWN_ACTION");
}
