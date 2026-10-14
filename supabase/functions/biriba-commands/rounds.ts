import {beginBiribaMatch,type BiribaMatch,type BiribaRoundHistory} from "./engine.ts";
import {biribaScoreRound,biribaTeamOf,biribaCardPoints} from "./rules.ts";
export function scoreFinishedBiribaRound(m:BiribaMatch):BiribaMatch{
 if(!m.roundEnded||m.roundScored)throw new Error("ROUND_NOT_AWAITING_SCORING");
 const opponentClosed=m.closedBy!==null;
 const breakdown=[0,1].map(team=>{
  const seats=Array.from({length:m.seats},(_,i)=>i).filter(i=>biribaTeamOf(i,m.seats)===team);
  const melds=m.melds.filter(md=>biribaTeamOf(md.ownerSeat,m.seats)===team);
  return biribaScoreRound({
    melds,held:seats.flatMap(i=>m.hands[i]??[]),
    tookPacket:m.packetTaken[team]??false,packetNeverPlayed:Boolean(m.packetTaken[team]&&!m.packetPlayed[team]),
    anyPlayerOpened:seats.some(i=>m.opened[i]),closed:m.closedBy===team
  },m.trump,opponentClosed);
 });
 const points=breakdown.map(b=>b.total) as [number,number];
 const teamScores:[number,number]=[m.teamScores[0]+points[0],m.teamScores[1]+points[1]];
 const playerPoints=Array.from({length:m.seats},(_,seat)=>({seat,
    cards:m.melds.filter(md=>md.ownerSeat===seat).reduce((sum,md)=>sum+md.cards.reduce((n,p)=>n+biribaCardPoints(p.card),0),0),
    held:m.packetTaken[biribaTeamOf(seat,m.seats)]&&!m.packetPlayed[biribaTeamOf(seat,m.seats)]?0:(m.hands[seat]??[]).reduce((sum,c)=>sum+biribaCardPoints(c),0)}));
 const record:BiribaRoundHistory={round:m.roundNumber,teamTotals:points,breakdown,playerPoints};
 const qualified=teamScores.some(p=>p>=m.target);
 const winner=qualified&&teamScores[0]!==teamScores[1]?(teamScores[0]>teamScores[1]?0:1):null;
 return {...m,teamScores,scoreHistory:[...m.scoreHistory,record],roundScored:true,
    matchFinished:winner!==null,winnerTeam:winner};
}
export function nextBiribaRound(m:BiribaMatch,random:()=>number=Math.random):BiribaMatch{
 if(!m.roundScored||m.matchFinished)throw new Error("CANNOT_START_NEXT_ROUND");
 const next=beginBiribaMatch(m.seats,random,m.target);
 return {...next,roundNumber:m.roundNumber+1,teamScores:m.teamScores,scoreHistory:m.scoreHistory,
   clock:{...next.clock,pausesUsed:[...m.clock.pausesUsed],botTakeovers:[...m.clock.botTakeovers]}};
}
