import { beats, canThrowIn, canTransfer, createDeck, maximumAttackCards, type DurakCard, type DurakSuit, type DurakVariant } from "./rules.ts";

export type DurakPair = { attack: DurakCard; defense?: DurakCard };
export type DurakPresentationEvent = {
  sequence: number; seat: number; card: DurakCard; kind: "attack" | "defend" | "transfer";
  round: number; attacker: number; defender: number; attackSeats: number[];
  pairs: DurakPair[]; handSizes: number[];
  /** Server-confirmed discard count after this card; never infer from visual defense alone. */
  discardCount?: number;
};
export type DurakMove =
  | { type: "attack"; card: DurakCard }
  | { type: "defend"; card: DurakCard; pair: number }
  | { type: "transfer"; card: DurakCard }
  | { type: "take" }
  | { type: "pass" }
  | { type: "finish" };
export type DurakMatch = {
  variant: DurakVariant; hands: DurakCard[][]; deck: DurakCard[];
  trump: DurakSuit; trumpCard: DurakCard; discard: DurakCard[];
  attacker: number; defender: number; primaryAttacker: number;
  pairs: DurakPair[]; passes: number[]; finishes: number[];
  taking: boolean; firstAttack: boolean; defenderStartingHand: number;
  ended: boolean; fool: number | null; round: number;
  /** Settled exits, in last-card play order; independent of bout finish actions. */
  finishOrder?: number[];
  pendingFinishOrder?: number[];
  finishOrderComplete?: boolean;
  presentationSequence?: number;
  presentationEvents?: DurakPresentationEvent[];
};
const key=(c:DurakCard)=>c.suit+":"+c.rank;
const clockwise=(seat:number,n:number)=>(seat+1)%n;
function alive(m:DurakMatch,i:number){return m.hands[i]!.length>0 || m.deck.length>0;}
function nextAlive(m:DurakMatch,from:number){for(let i=1;i<=m.hands.length;i++){const index=(from+i)%m.hands.length;if(alive(m,index))return index;}return from;}
function previousAlive(m:DurakMatch,from:number){for(let i=1;i<=m.hands.length;i++){const index=(from-i+m.hands.length)%m.hands.length;if(alive(m,index))return index;}return from;}
function remove(hand:DurakCard[],card:DurakCard){const pos=hand.findIndex(c=>key(c)===key(card));if(pos<0)throw new Error("CARD_NOT_OWNED");hand.splice(pos,1);}
function clone(m:DurakMatch):DurakMatch{return {...m,hands:m.hands.map(h=>[...h]),deck:[...m.deck],discard:[...m.discard],pairs:m.pairs.map(p=>({...p})),passes:[...m.passes],finishes:[...m.finishes],finishOrder:[...(m.finishOrder??[])],pendingFinishOrder:[...(m.pendingFinishOrder??[])]};}
function attackers(m:DurakMatch){const previous=previousAlive(m,m.defender);const following=nextAlive(m,m.defender);return [...new Set([previous,following])].filter(i=>i!==m.defender&&alive(m,i));}
function allowedAttackers(m:DurakMatch){return attackers(m).filter(i=>!m.finishes.includes(i));}
/** Public role eligibility only; never infer opponents' card ranks for presentation. */
export function durakAttackSeats(m: DurakMatch): number[] {
  if (m.ended) return [];
  return m.pairs.length === 0 ? [m.primaryAttacker] : m.pairs.length >= cap(m) ? [] : allowedAttackers(m);
}
function table(m:DurakMatch){return m.pairs.flatMap(p=>p.defense?[p.attack,p.defense]:[p.attack]);}
function cap(m:DurakMatch){return maximumAttackCards(m.defenderStartingHand,m.firstAttack);}
export function beginDurak(variant:DurakVariant,players:number,random:()=>number=Math.random):DurakMatch{
  if(players<2||players>6||!Number.isInteger(players))throw new Error("INVALID_PLAYERS");
  const shuffled=createDeck();
  for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j]!,shuffled[i]!];}
  const hands=Array.from({length:players},()=>[] as DurakCard[]);
  for(let i=0;i<6;i++)for(let p=0;p<players;p++)hands[p]!.push(shuffled.pop()!);
  const trumpCard=shuffled.length?shuffled[0]!:hands[players-1]![5]!;
  const trump=trumpCard.suit;
  let attacker=0,lowest=Infinity;
  for(let p=0;p<players;p++)for(const card of hands[p]!){if(card.suit===trump&&card.rank<lowest){lowest=card.rank;attacker=p;}}
  const m:DurakMatch={variant,hands,deck:shuffled,trump,trumpCard,discard:[],attacker,primaryAttacker:attacker,defender:clockwise(attacker,players),pairs:[],passes:[],finishes:[],taking:false,firstAttack:true,defenderStartingHand:0,ended:false,fool:null,round:1,finishOrder:[],pendingFinishOrder:[],finishOrderComplete:true};
  m.defenderStartingHand=m.hands[m.defender]!.length;
  return m;
}
export function legalDurakMoves(m:DurakMatch,seat:number):DurakMove[]{
  if(m.ended||seat<0||seat>=m.hands.length)return[];
  const hand=m.hands[seat]!,moves:DurakMove[]=[];
  if(seat===m.defender){
    if(m.taking)return[];
    const uncovered=m.pairs.map((pair,i)=>({pair,i})).filter(x=>!x.pair.defense);
    for(const {pair,i} of uncovered)for(const card of hand)if(beats(pair.attack,card,m.trump))moves.push({type:"defend",card,pair:i});
    if(m.variant==="perevodnoy"&&uncovered.length===m.pairs.length&&m.pairs.length>0){
      const recipient=nextAlive(m,seat);
      if(recipient!==seat&&recipient!==m.primaryAttacker||m.hands.length===2){
        for(const card of hand)if(canTransfer(m.variant,card,m.pairs.map(p=>p.attack),false,m.hands[recipient]!.length,m.firstAttack))moves.push({type:"transfer",card});
      }
    }
    if(m.pairs.length)moves.push({type:"take"});
  }else if(allowedAttackers(m).includes(seat)){
    if(m.pairs.length===0){
      if(seat===m.primaryAttacker)for(const card of hand)moves.push({type:"attack",card});
    }else{
      if(m.pairs.length<cap(m))for(const card of hand)if(canThrowIn(card,table(m)))moves.push({type:"attack",card});
      if(!m.finishes.includes(seat)){
        moves.push({type:"pass"},{type:"finish"});
      }
    }
  }
  return moves;
}
export function sameDurakMove(a:DurakMove,b:DurakMove){return a.type===b.type&&("card" in a?"card" in b&&key(a.card)===key(b.card):true)&&("pair" in a?"pair" in b&&a.pair===b.pair:true);}
function refill(m:DurakMatch){const order=[m.primaryAttacker,...Array.from({length:m.hands.length-1},(_,i)=>(m.primaryAttacker+i+1)%m.hands.length)];for(const seat of order){while(m.hands[seat]!.length<6&&m.deck.length)m.hands[seat]!.push(m.deck.pop()!);}}
function close(m:DurakMatch){
  const cards=table(m);if(m.taking)m.hands[m.defender]!.push(...cards);else m.discard.push(...cards);
  refill(m);
  // Confirm exits only after pickup/refill: an empty defender can still take.
  const exited=m.hands.map((h,i)=>({i,n:h.length})).filter(x=>x.n===0&&m.deck.length===0).map(x=>x.i);
  const order=m.finishOrder!;
  for(const seat of m.pendingFinishOrder!){if(exited.includes(seat)&&!order.includes(seat))order.push(seat);}
  if(exited.some(seat=>!order.includes(seat)))m.finishOrderComplete=false;
  m.pendingFinishOrder=[];
  const oldDef=m.defender;
  if(!m.deck.length){const players=m.hands.map((h,i)=>({i,n:h.length})).filter(x=>x.n>0);if(players.length<=1){m.ended=true;m.fool=players[0]?.i??null;}}
  if(m.ended){m.pairs=[];return;}
  m.primaryAttacker=m.taking?nextAlive(m,oldDef):(alive(m,oldDef)?oldDef:nextAlive(m,oldDef));
  m.attacker=m.primaryAttacker;m.defender=nextAlive(m,m.primaryAttacker);
  m.pairs=[];m.passes=[];m.finishes=[];m.taking=false;m.firstAttack=false;
  m.defenderStartingHand=m.hands[m.defender]!.length;m.round++;
}
function mayClose(m:DurakMatch){
 const required=attackers(m);
 if(m.taking){if(required.every(i=>m.finishes.includes(i))||m.pairs.length>=cap(m))close(m);}
 else if(m.pairs.length>0&&m.pairs.every(p=>p.defense)&&required.every(i=>m.finishes.includes(i)))close(m);
}
export function applyDurakMove(state:DurakMatch,seat:number,move:DurakMove):DurakMatch{
 const options=legalDurakMoves(state,seat);
 if(!options.some(m=>sameDurakMove(m,move)))throw new Error("ILLEGAL_DURAK_MOVE");
 const m=clone(state);
 // Legacy games have no historical exit order; never invent their rankings.
 m.finishOrderComplete=state.finishOrderComplete??(!state.deck.length?state.hands.every(h=>h.length>0):true);
 if(move.type==="attack"){remove(m.hands[seat]!,move.card);m.pairs.push({attack:move.card});m.passes=[];}
 else if(move.type==="defend"){remove(m.hands[seat]!,move.card);m.pairs[move.pair]!.defense=move.card;}
 else if(move.type==="transfer"){
   remove(m.hands[seat]!,move.card);m.pairs.push({attack:move.card});
   m.primaryAttacker=seat;m.attacker=seat;m.defender=nextAlive(m,seat);
   m.defenderStartingHand=m.hands[m.defender]!.length;
   m.passes=[];m.finishes=[];
 }else if(move.type==="take"){m.taking=true;}
 else if(move.type==="finish"){m.finishes.push(seat);m.passes=m.passes.filter(x=>x!==seat);}
 else if(move.type==="pass"){if(!m.passes.includes(seat))m.passes.push(seat);}
 if("card" in move&&m.hands[seat]!.length===0&&!m.finishOrder!.includes(seat)&&!m.pendingFinishOrder!.includes(seat))m.pendingFinishOrder!.push(seat);
 mayClose(m);return m;
}
