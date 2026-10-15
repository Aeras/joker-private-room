import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2";
import {beginBiribaMatch,biribaAction,type BiribaMatch,type BiribaAction} from "./engine.ts";
import {type BiribaSeatCount} from "./rules.ts";
import {chooseBiribaBotStep} from "./bot.ts";
import {scoreFinishedBiribaRound,nextBiribaRound} from "./rounds.ts";
import {pauseBiribaClock,resumeBiribaClock,timeoutBiribaClock,reclaimBiribaClock} from "./clock.ts";
import {CANONICAL_BOTS} from "../_shared/bot-catalog.ts";
import {recoverUnclaimedBiribaPacket} from "./recoverPacket.ts";
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const allowed=new Set(["create","join","list","get","membership","leave","bot_add","bot_remove","start","get_game","move","pause","resume","reclaim","next_round","end_game"]);
const actions=new Set(["draw","pickup","meld","extend","discard"]);
const number=(v:unknown)=>typeof v==="number"&&Number.isInteger(v);
Deno.serve(async(req)=>{
 if(req.method!=="POST")return json({ok:false,code:"INVALID_METHOD"},405);
 try{
  const body=await req.json() as Record<string,unknown>;
  const action=String(body.action??"");
  const token=String(body.sessionToken??"");
  if(!/^[a-f0-9]{64}$/i.test(token))return json({ok:false,code:"NOT_AUTHENTICATED"},401);
  if(!allowed.has(action))return json({ok:false,code:"INVALID_ACTION"},400);
  const code=String(body.code??"").toUpperCase();
  if(!["create","list","membership"].includes(action)&&!/^[A-Z0-9]{6}$/.test(code))return json({ok:false,code:"INVALID_CODE"},400);
  if(action==="create"&&(![2,4].includes(Number(body.capacity))||![1000,2000,5000,10000].includes(Number(body.target))|| (body.timerEnabled!==undefined&&typeof body.timerEnabled!=="boolean")))
   return json({ok:false,code:"INVALID_OPTIONS"},400);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return json({ok:false,code:"SERVICE_UNAVAILABLE"},503);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const rpc=async(a:string,over:Record<string,unknown>={})=>
   admin.rpc("biriba_room_command_internal",{
    p_session_token:token,p_action:a,p_code:code||null,
    p_capacity:action==="create"?body.capacity:null,
    p_target:action==="create"?body.target:null,
    p_timer_enabled:action==="create"?(body.timerEnabled??true):null,
    p_seat:number(body.seat)?body.seat:null,
    p_bot_id:typeof body.botId==="string"?body.botId:null,
    p_catalog:CANONICAL_BOTS,
    p_state:null,p_revision:null,...over
   });
  const reply=(data:unknown,error:unknown)=>error?json({ok:false,code:"SERVICE_UNAVAILABLE"},503):json(data,(data as {ok?:boolean}|null)?.ok?200:400);
  if(["create","join","list","get","membership","leave","bot_add","bot_remove","end_game"].includes(action)){
   if(action==="bot_add"&&body.botId!==undefined&&!CANONICAL_BOTS.some(b=>b.id===body.botId))return json({ok:false,code:"INVALID_BOT"},400);
   if(action==="bot_remove"&&!number(body.seat))return json({ok:false,code:"INVALID_SEAT"},400);
   const {data,error}=await rpc(action,{p_seat:number(body.seat)?body.seat:null});
   return reply(data,error);
  }
  if(action==="start"){
   const {data:room,error}=await rpc("get");
   if(error||!room?.ok)return json({ok:false,code:"ROOM_NOT_FOUND"},400);
   const count=room.room.capacity as BiribaSeatCount;
   const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]!/4294967296;
   const state={...beginBiribaMatch(count,random,room.room.target),timerEnabled:room.room.timerEnabled!==false};
   const result=await rpc("start",{p_state:state});
   return reply(result.data,result.error);
  }
  const loaded=await rpc("load");
  if(loaded.error||!loaded.data?.ok)return reply(loaded.data,loaded.error);
  const seat=loaded.data.seat as number;
  const revision=loaded.data.revision as number;
  const original=loaded.data.state as BiribaMatch;
  let match=original;
  if(action==="get_game")match=recoverUnclaimedBiribaPacket(match);
  const room=await rpc("get");
  if(room.error||!room.data?.ok)return json({ok:false,code:"SERVICE_UNAVAILABLE"},503);
  const seats=room.data.room.seats as Array<{index:number;occupant:string;name:string;botId?:string;tier?:number}>;
  const now=Date.now();
  if(!match.clock)return json({ok:false,code:"INVALID_STATE"},503);
  if(action==="next_round"){
   if(seat!==0||!match.roundScored||match.matchFinished)return json({ok:false,code:"NEXT_ROUND_DENIED"},409);
   const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]!/4294967296;
   match=nextBiribaRound(match,random);
  }else if(action==="pause"||action==="resume"||action==="reclaim"){
   try{
    if(!match.timerEnabled)return json({ok:false,code:"TIMER_DISABLED"},409);
    const clock=action==="pause"
      ?pauseBiribaClock(match.clock,seat,match.turn,true,now)
      :action==="resume"
       ?resumeBiribaClock(match.clock,seat,now)
       :reclaimBiribaClock(match.clock,seat,match.turn,now);
    match={...match,clock};
   }catch{return json({ok:false,code:"CONTROL_DENIED"},409);}
  }else{
   if(match.clock.pausedBy!==null){
    if(action==="move")return json({ok:false,code:"PAUSED"},409);
   }else{
    match={...match,clock:match.timerEnabled?timeoutBiribaClock(match.clock,match.turn,
      seats.some(s=>s.index===match.turn&&s.occupant==="human"),now):match.clock};
    if(action==="move"){
     if(match.timerEnabled&&(match.clock.botTakeovers.includes(seat)||now>match.clock.turnDeadline))
      return json({ok:false,code:"TURN_EXPIRED"},409);
     const move=body.move as BiribaAction|undefined;
     if(!move||!actions.has(String(move.type)))return json({ok:false,code:"INVALID_MOVE"},400);
     try{match=biribaAction(match,seat,move);}catch{return json({ok:false,code:"ILLEGAL_MOVE"},400);}
    }
    // Make pending bot moves in one bounded pass; never expose their private hands.
    for(let count=0;count<60&&!match.roundEnded;count++){
     const bot=seats.find(s=>s.index===match.turn&&(s.occupant==="bot"||match.clock.botTakeovers.includes(s.index)));
     if(!bot)break;
     const changed=chooseBiribaBotStep(match,bot.index,(bot.tier===3?3:bot.tier===2?2:1));
     if(changed===match)break;
     match=changed;
    }
   }
  }
  // Server-authoritative round handoff. All clients poll get_game; none
  // needs the host's browser to perform a manual next_round action.
  if(match.roundEnded&&!match.roundScored){
    match={...scoreFinishedBiribaRound(match),roundTransitionAt:now+3500};
  }else if(action==="get_game"&&match.roundScored&&!match.matchFinished){
    const due=(match as BiribaMatch & {roundTransitionAt?:number}).roundTransitionAt;
    // Recover already-scored rounds written before this rollout immediately.
    if(due===undefined||now>=due){
      const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]!/4294967296;
      match=nextBiribaRound(match,random);
    }
  }
  if(JSON.stringify(match)!==JSON.stringify(original)){
   const saved=await rpc("save",{p_state:match,p_revision:revision});
   if(saved.error||!saved.data?.ok)return reply(saved.data,saved.error);
  }
  const {hands,packets,stock,...publicState}=match;
  const view={...publicState,stockCount:stock.length,handCounts:hands.map(h=>h.length),
   myHand:hands[seat],packetCounts:packets.map(p=>p.length),seat,revision:JSON.stringify(match)===JSON.stringify(original)?revision:revision+1,
   currentPlayerName:seats.find(s=>s.index===match.turn)?.name,roomSeats:seats};
  return json({ok:true,game:view});
 }catch(err){
  console.error("BIRIBA_EDGE",err instanceof Error?err.name:"unknown");
  return json({ok:false,code:"SERVICE_UNAVAILABLE"},503);
 }
});
