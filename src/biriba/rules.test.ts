import {describe,expect,it} from "vitest";
import {makeBiribaDeck,biribaCardPoints,biribaMeldValid,biribaMeldDirty,biribaMeldBonus,biribaCanFinish,biribaScoreRound,biribaTeamOf,canPauseBiriba,type BiribaCard,type BiribaMeld,type BiribaRank} from "./rules";
const card=(rank:number,suit="spades",id=`${suit}-${rank}`):BiribaCard=>({id,rank:rank as BiribaRank,suit:suit as "spades"});
const joker:BiribaCard={id:"joker0",joker:true};
const meld=(values:number[],suit:"spades"|"hearts"="spades"):BiribaMeld=>({ownerSeat:0,suit,highAce:false,cards:values.map(v=>({value:v,card:card(v,suit)}))});
describe("Biriba independent rule foundation",()=>{
 it("deals from 108 unique physical cards",()=>{const d=makeBiribaDeck();expect(d.length).toBe(108);expect(new Set(d.map(c=>c.id)).size).toBe(108);});
 it("sets exact card values",()=>{expect([joker,card(2),card(1),card(9),card(4)].map(biribaCardPoints)).toEqual([25,20,15,10,5]);});
 it("seats opposite players in same team",()=>{expect([0,1,2,3].map(s=>biribaTeamOf(s,4))).toEqual([0,1,0,1]);});
 it("allows one joker and natural suit two together",()=>{const m=meld([2,3,4,5,6]);m.cards[4]={card:joker,value:6};expect(biribaMeldValid(m)).toBe(true);expect(biribaMeldDirty(m)).toBe(true);});
 it("rejects two active wildcards",()=>{const m=meld([3,4,5,6]);m.cards[2]={card:joker,value:5};m.cards[3]={card:card(2,"hearts"),value:6};expect(biribaMeldValid(m)).toBe(false);});
 it("natural 2 does not dirty or move",()=>{const m=meld([2,3,4]);expect(biribaMeldDirty(m)).toBe(false);m.cards[0]={card:card(2),value:3};expect(biribaMeldValid(m)).toBe(false);});
 it("scores final meld once and respects trump",()=>{const m=meld([2,3,4,5,6,7,8]);expect(biribaMeldBonus(m,null)).toBe(300);expect(biribaMeldBonus(m,"spades")).toBe(600);});
 it("scores thousand melds without stacking previous bonuses",()=>{const m=meld([1,2,3,4,5,6,7,8,9,10,11,12,13]);expect(biribaMeldBonus(m,null)).toBe(1000);expect(biribaMeldBonus(m,"spades")).toBe(2000);});
 it("only closes with packet played, two biribas including clean, final discard",()=>{const a=meld([2,3,4,5,6,7,8]);const b=meld([5,6,7,8,9,10,11]);b.cards[2]={card:joker,value:7};expect(biribaCanFinish([a,b],true,true)).toBe(true);expect(biribaCanFinish([a,b],false,true)).toBe(false);expect(biribaCanFinish([a,b],true,false)).toBe(false);});
 it("applies one exclusive penalty for no melds/no packet",()=>{const empty={melds:[],held:[card(9)],tookPacket:false,packetNeverPlayed:false,closed:false};expect(biribaScoreRound({...empty,anyPlayerOpened:true},null).total).toBe(-110);expect(biribaScoreRound({...empty,anyPlayerOpened:false},null).total).toBe(-210);});
 it("uses flat unplayed-packet penalty rather than its 11 card values",()=>{const result=biribaScoreRound({melds:[],held:[joker],tookPacket:true,packetNeverPlayed:true,anyPlayerOpened:true,closed:false},null);expect(result.total).toBe(-100);});
 it("limits real player's personal pauses",()=>{expect(canPauseBiriba(true,true,2,false)).toBe(true);expect(canPauseBiriba(true,true,3,false)).toBe(false);expect(canPauseBiriba(false,true,0,false)).toBe(false);});
});
