import {createServerFn} from "@tanstack/react-start";
import {getCookie} from "@tanstack/react-start/server";
import {z} from "zod";
import {EXTERNAL_SUPABASE_URL,EXTERNAL_SUPABASE_PUBLISHABLE_KEY} from "@/integrations/external-supabase/client";
import type {BiribaCard,BiribaMeld,BiribaSuit} from "@/biriba/rules";
const code=z.string().regex(/^[A-Za-z0-9]{6}$/);
const request=z.object({
 action:z.enum(["create","list","membership","get","join","leave","start","get_game","end_game","bot_add","bot_remove","move","pause","resume","reclaim","next_round"]),
 code:code.optional(),capacity:z.union([z.literal(2),z.literal(4)]).optional(),
 target:z.union([z.literal(1000),z.literal(2000),z.literal(5000),z.literal(10000)]).optional(),
 timerEnabled:z.boolean().optional(),
 seat:z.number().int().min(0).max(3).optional(),botId:z.string().max(64).optional(),
 move:z.unknown().optional(),
});
export type BiribaRoomSeat={index:number;occupant:"human"|"bot"|"empty";name:string|null;botId?:string|null;tier?:number|null};
export type BiribaRoomView={code:string;capacity:2|4;target:1000|2000|5000|10000;timerEnabled:boolean;lifecycle:string;version:number;hostPlayerId:string;seats:BiribaRoomSeat[]};
export type BiribaGameView={
 seats:2|4;turn:number;phase:"draw"|"meld"|"ended";melds:BiribaMeld[];
 trump:BiribaSuit|null;discards:BiribaCard[];stockCount:number;handCounts:number[];
 myHand:BiribaCard[];seat:number;revision:number;packetCounts:number[];roundEnded:boolean;
 roomSeats:BiribaRoomSeat[];opened:boolean[];packetTaken:boolean[];packetPlayed:boolean[];
 clock:{turnDeadline:number;remainingMs:number;pausedBy:number|null;pausesUsed:number[];botTakeovers:number[]};
 timerEnabled:boolean;target:number;roundNumber:number;teamScores:[number,number];roundScored:boolean;matchFinished:boolean;winnerTeam:number|null;
 scoreHistory:Array<{round:number;teamTotals:[number,number];breakdown:Array<{cards:number;bonuses:number;closing:number;penalty:number;held:number;total:number}>;playerPoints:Array<{seat:number;cards:number;held:number}>}>;
};
export type BiribaResponse={ok:true;room:BiribaRoomView}|{ok:true;rooms:Array<{code:string;capacity:2|4;target:number;timerEnabled:boolean;hostName:string;occupied:number}>}|
 {ok:true;membership:{code:string;lifecycle:string}|null}|{ok:true;cancelled:boolean}|
 {ok:true;started:boolean}|{ok:true;updated:boolean}|{ok:true;game:BiribaGameView}|{ok:false;code:string};
export const biribaCommand=createServerFn({method:"POST"}).validator(request).handler(async({data}):Promise<BiribaResponse>=>{
 const sessionToken=getCookie("__Host-joker_session");
 if(!sessionToken)return {ok:false,code:"NOT_AUTHENTICATED"};
 try{
  const response=await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/biriba-commands`,{
   method:"POST",headers:{apikey:EXTERNAL_SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"},
   body:JSON.stringify({...data,sessionToken})
  });
  const result=await response.json() as BiribaResponse;
  if(result&&typeof result==="object"&&typeof result.ok==="boolean")return result;
 }catch{/* Server transport error, no leaking implementation details. */}
 return {ok:false,code:"SERVICE_UNAVAILABLE"};
});
