/** BIRIBA ONLY. These cards, rules and scores must never import JOKER or DURAK engines. */
export const BIRIBA_SUITS = ["spades","hearts","diamonds","clubs"] as const;
export type BiribaSuit = typeof BIRIBA_SUITS[number];
export type BiribaRank = 1|2|3|4|5|6|7|8|9|10|11|12|13;
export type BiribaCard = { id:string; suit:BiribaSuit; rank:BiribaRank; joker?:false } | { id:string; joker:true };
export type BiribaTarget = 1000|2000|5000|10000;
export const BIRIBA_TARGETS:readonly BiribaTarget[] = [1000,2000,5000,10000] as const;
export const DEFAULT_BIRIBA_TARGET:BiribaTarget = 5000;
export const BIRIBA_HAND_SIZE=11;
export const BIRIBA_PACKET_SIZE=11;
export const BIRIBA_JOKERS=4;
export const BIRIBA_DECK_SIZE=108;
export const BIRIBA_TURN_SECONDS=60;
export const BIRIBA_PAUSES_PER_HUMAN=3;
export type BiribaSeatCount=2|4;
export function biribaTeamOf(seat:number,seats:BiribaSeatCount):number {
  if(!Number.isInteger(seat)||seat<0||seat>=seats)throw new Error("INVALID_SEAT");
  return seats===2?seat:seat%2; // 0 and 2 together; 1 and 3 together.
}
export function makeBiribaDeck():BiribaCard[]{
  const deck:BiribaCard[]=[];
  for(let copy=0;copy<2;copy++)for(const suit of BIRIBA_SUITS)
    for(let value=1;value<=13;value++)
      deck.push({id:`biriba-${copy}-${suit}-${value}`,suit,rank:value as BiribaRank});
  for(let j=0;j<4;j++)deck.push({id:`biriba-joker-${j}`,joker:true});
  return deck;
}
export function shuffleBiriba(cards:readonly BiribaCard[],random:()=>number):BiribaCard[]{
  const deck=cards.slice();
  for(let i=deck.length-1;i>0;i--){
    const number=random();
    if(!Number.isFinite(number)||number<0||number>=1)throw new Error("INVALID_RNG");
    const j=Math.floor(number*(i+1));
    [deck[i],deck[j]]=[deck[j]!,deck[i]!];
  }
  return deck;
}
export function biribaCardPoints(card:BiribaCard):number {
  if(card.joker)return 25;
  if(card.rank===2)return 20;
  if(card.rank===1)return 15;
  return card.rank>=8?10:5;
}
/** Every card placement has its own logical value; highAce=true places Ace after K (as 14). */
export type BiribaPlacement = {card:BiribaCard;value:number};
export type BiribaMeld = {ownerSeat:number;suit:BiribaSuit;highAce:boolean;cards:BiribaPlacement[]};
export function biribaMeldValid(meld:BiribaMeld):boolean {
  const cards=meld.cards;
  if(cards.length<3||cards.length>13)return false;
  if(new Set(cards.map(p=>p.card.id)).size!==cards.length)return false;
  let wild=0;
  const values=cards.map(p=>p.value);
  if(values.some(v=>!Number.isInteger(v)||v<1||v>14))return false;
  if(new Set(values).size!==values.length)return false;
  for(let i=1;i<values.length;i++)if(values[i]!==values[i-1]!+1)return false;
  if(meld.highAce) {
    if(values.includes(1))return false;
  } else if(values.includes(14))return false;
  for(const {card,value} of cards){
    if(card.joker){wild++;continue;}
    const natural=card.suit===meld.suit&&(card.rank===value||(card.rank===1&&value===14&&meld.highAce));
    if(card.rank===2&&!natural){wild++;continue;}
    if(!natural)return false;
  }
  return wild<=1;
}
export function biribaMeldDirty(meld:BiribaMeld):boolean {
  if(!biribaMeldValid(meld))throw new Error("INVALID_MELD");
  return meld.cards.some(p=>p.card.joker || (!p.card.joker&&p.card.rank===2&&(p.card.suit!==meld.suit||p.value!==2)));
}
export function biribaMeldBonus(meld:BiribaMeld,trump:BiribaSuit|null):number {
  if(!biribaMeldValid(meld))throw new Error("INVALID_MELD");
  if(meld.cards.length<7)return 0;
  const dirty=biribaMeldDirty(meld);
  const suited=trump===meld.suit;
  if(meld.cards.length===13)return dirty?(suited?1000:500):(suited?2000:1000);
  return dirty?(suited?300:100):(suited?600:300);
}
export function biribaCanFinish(melds:readonly BiribaMeld[],packetPlayed:boolean,discardedFinalCard:boolean):boolean {
  const biribas=melds.filter(m=>biribaMeldValid(m)&&m.cards.length>=7);
  return packetPlayed&&discardedFinalCard&&biribas.length>=2&&biribas.some(m=>!biribaMeldDirty(m));
}
export type BiribaTeamEnd={ melds:BiribaMeld[]; held:BiribaCard[]; tookPacket:boolean; packetNeverPlayed:boolean; anyPlayerOpened:boolean; closed:boolean };
export function biribaScoreRound(team:BiribaTeamEnd,trump:BiribaSuit|null,opponentClosed=true):{cards:number;bonuses:number;closing:number;penalty:number;held:number;total:number}{
  if(team.melds.some(m=>!biribaMeldValid(m)))throw new Error("INVALID_MELD");
  const cards=team.melds.reduce((sum,m)=>sum+m.cards.reduce((s,p)=>s+biribaCardPoints(p.card),0),0);
  const bonuses=team.melds.reduce((sum,m)=>sum+biribaMeldBonus(m,trump),0);
  const closing=team.closed?100:0;
  const biribas=team.melds.filter(m=>m.cards.length>=7).length;
  let penalty=0;
  if(opponentClosed&&team.packetNeverPlayed)penalty=100;
  else if(opponentClosed&&!team.tookPacket){
    if(biribas===0)penalty=opponentClosed?(team.anyPlayerOpened?100:200):100;
    else penalty=100;
  }
  const held=team.packetNeverPlayed?0:team.held.reduce((sum,c)=>sum+biribaCardPoints(c),0);
  return {cards,bonuses,closing,penalty,held,total:cards+bonuses+closing-penalty-held};
}
/** Server-controlled pause counters, never reset on each deal. */
export function canPauseBiriba(isHuman:boolean,isActiveSeat:boolean,used:number,paused:boolean):boolean {
  return isHuman&&isActiveSeat&&!paused&&Number.isInteger(used)&&used<BIRIBA_PAUSES_PER_HUMAN;
}
