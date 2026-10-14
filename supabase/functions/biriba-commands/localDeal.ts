import {BIRIBA_HAND_SIZE,BIRIBA_PACKET_SIZE,makeBiribaDeck,shuffleBiriba,type BiribaCard,type BiribaSeatCount,type BiribaSuit} from "./rules.ts";
export type BiribaDealtPreview={
  seats:BiribaSeatCount;
  hands:BiribaCard[][];
  packets:[BiribaCard[],BiribaCard[]];
  stock:BiribaCard[];
  discard:BiribaCard[];
  trump:BiribaSuit|null;
};
/** Local deal preview only; multiplayer cards/deals require independent server authority. */
export function createBiribaLocalDeal(seats:BiribaSeatCount,random:()=>number=Math.random):BiribaDealtPreview{
 const shuffled=shuffleBiriba(makeBiribaDeck(),random);
 const hands:Array<BiribaCard[]>=Array.from({length:seats},()=>[]);
 for(let i=0;i<BIRIBA_HAND_SIZE;i++)for(let seat=0;seat<seats;seat++)hands[seat]!.push(shuffled.pop()!);
 const packetA=shuffled.splice(-BIRIBA_PACKET_SIZE),packetB=shuffled.splice(-BIRIBA_PACKET_SIZE);
 const starter=shuffled.pop()!;
 return {seats,hands,packets:[packetA,packetB],stock:shuffled,discard:[starter],trump:starter.joker?null:starter.suit};
}
