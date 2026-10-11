import { endDurakGame } from "./end-game.ts";
import { recordDurakPlay, publicDurakEvents } from "./presentation.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { beginDurak, applyDurakMove, legalDurakMoves, sameDurakMove, durakAttackSeats, type DurakMatch, type DurakMove } from "./engine.ts";
import { advanceDurakBot, scheduleDurakBot, startDurakDeal } from "./bot-turn.ts";

const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});
const gameActions=new Set(["bot_add","bot_remove","start","get_game","move","end_game"]);
const errors=(result:{ok?:boolean;code?:string})=>result.ok?200:result.code==="NOT_AUTHENTICATED"?401:result.code==="NOT_A_MEMBER"?403:result.code==="STATE_CHANGED"?409:400;
const isMove=(x:unknown):x is DurakMove=>{
 if(!x||typeof x!=="object")return false;
 const m=x as Record<string,unknown>;
 if(!["attack","defend","transfer","take","pass","finish"].includes(String(m.type)))return false;
 if(["attack","defend","transfer"].includes(String(m.type))){
  const card=m.card as Record<string,unknown>|null;
  if(!card||!["clubs","diamonds","hearts","spades"].includes(String(card.suit))||
    !Number.isInteger(card.rank)||Number(card.rank)<6||Number(card.rank)>14)return false;
 }
 return m.type!=="defend"||(Number.isInteger(m.pair)&&Number(m.pair)>=0);
};

Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return respond({ok:false,code:"INVALID_ACTION"},405);
 try{
  const body=await req.json();
  const token=typeof body?.sessionToken==="string"?body.sessionToken:"";
  const action=typeof body?.action==="string"?body.action:"";
  if(!/^[0-9a-f]{64}$/i.test(token))return respond({ok:false,code:"NOT_AUTHENTICATED"},401);
  if(!["create","join","leave","get","list","membership",...gameActions].includes(action))
    return respond({ok:false,code:"INVALID_ACTION"},400);
  const code=typeof body?.code==="string"?body.code.toUpperCase():"";
  if(["join","leave","get",...gameActions].includes(action)&&!/^[A-Z0-9]{6}$/.test(code))
    return respond({ok:false,code:"INVALID_OPTIONS"},400);
  const variant=body?.variant;
  const capacity=body?.capacity;
  if(action==="create"&&(!["podkidnoy","perevodnoy"].includes(variant)||!Number.isInteger(capacity)||capacity<2||capacity>6))
    return respond({ok:false,code:"INVALID_OPTIONS"},400);
  const url=Deno.env.get("SUPABASE_URL");
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return respond({ok:false,code:"SERVICE_UNAVAILABLE"},503);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  if(action==="end_game"){const result=await endDurakGame(admin,token,code);return respond(result,result.ok?200:result.code==="HOST_ONLY"?403:result.code==="SERVICE_UNAVAILABLE"?503:errors(result));}
  const roomRpc=async(a:string)=>admin.rpc("durak_room_command_internal",{
    p_session_token:token,p_action:a,p_code:code||null,
    p_variant:a==="create"?variant:null,p_capacity:a==="create"?capacity:null
  });
  const gameRpc=async(a:string,expectedRevision?:number,state?:DurakMatch,seat?:number)=>
    admin.rpc("durak_match_command_internal",{
      p_session_token:token,p_room_code:code,p_action:a,
      p_expected_revision:expectedRevision??null,p_state:state??null,p_seat:seat??null
    });
  if(!gameActions.has(action)){
    const {data,error}=await roomRpc(action);
    if(error){
      if(error.code==="23505"&&error.message?.includes("ACTIVE_GAME_EXISTS"))
        return respond({ok:false,code:"ACTIVE_GAME_EXISTS"},409);
      console.error("DURAK lobby RPC",error.code);
      return respond({ok:false,code:"SERVICE_UNAVAILABLE"},503);
    }
    const result=data&&typeof data==="object"?data:{ok:false,code:"SERVICE_UNAVAILABLE"};
    return respond(result,errors(result));
  }
  if(action==="bot_add"||action==="bot_remove"){
    const seat=action==="bot_remove"&&Number.isInteger(body?.seat)?Number(body.seat):undefined;
    const {data,error}=await gameRpc(action,undefined,undefined,seat);
    if(error){console.error("DURAK bot RPC",error.code);return respond({ok:false,code:"SERVICE_UNAVAILABLE"},503);}
    return respond(data,errors(data));
  }
  if(action==="start"){
    const {data:roomData,error:roomError}=await roomRpc("get");
    if(roomError||!roomData?.ok||!roomData?.room)return respond({ok:false,code:"ROOM_NOT_FOUND"},400);
    const view=roomData.room as {variant:"podkidnoy"|"perevodnoy";capacity:number};
    const secureRandom=()=>crypto.getRandomValues(new Uint32Array(1))[0]!/4294967296;
    const game=startDurakDeal(beginDurak(view.variant,view.capacity,secureRandom),Date.now());
    const {data,error}=await gameRpc("start",undefined,game);
    if(error){console.error("DURAK start RPC",error.code);return respond({ok:false,code:"SERVICE_UNAVAILABLE"},503);}
    return respond(data,errors(data));
  }
  const {data:loaded,error:loadError}=await gameRpc("load");
  if(loadError||!loaded?.ok)return respond(loaded??{ok:false,code:"SERVICE_UNAVAILABLE"},errors(loaded??{}));
  let state=loaded.state as DurakMatch;
  const seat=loaded.seat as number;
  const revision=loaded.revision as number;
  if(action==="move"){
    if(Date.now()<(state.dealReadyAt??0))return respond({ok:false,code:"DEALING"},409);
    if(!isMove(body?.move))return respond({ok:false,code:"INVALID_MOVE"},400);
    const allowed=legalDurakMoves(state,seat);
    if(!allowed.some(m=>sameDurakMove(m,body.move)))return respond({ok:false,code:"ILLEGAL_MOVE"},400);
    state=scheduleDurakBot(recordDurakPlay(state,applyDurakMove(state,seat,body.move),seat,body.move),Date.now());
  }
  // Every bot move is made server-side. Never send nonlocal human hands to the client.
  if(!state.ended&&action==="get_game"&&Date.now()>=(state.nextBotAt??0)){
    const {data:roomData,error:roomError}=await roomRpc("get");
    if(roomError||!roomData?.ok)return respond({ok:false,code:"SERVICE_UNAVAILABLE"},503);
    const seats=roomData.room.seats as Array<{index:number;occupant:string}>;
    state=advanceDurakBot(state,seats,Date.now());
  }
  const changed=action==="move"||JSON.stringify(state)!==JSON.stringify(loaded.state);
  let version=revision;
  if(changed){
    const {data:saved,error:saveError}=await gameRpc("save",revision,state);
    if(saveError||!saved?.ok)return respond(saved??{ok:false,code:"SERVICE_UNAVAILABLE"},errors(saved??{}));
    version=saved.revision as number;
  }
  const ownCards=state.hands[seat]??[];
  const view={
    variant:state.variant,trump:state.trump,trumpCard:state.trumpCard,
    stock:state.deck.length,discardCount:state.discard.length,
    round:state.round,attacker:state.primaryAttacker,defender:state.defender,
    pairs:state.pairs,taking:state.taking,ended:state.ended,fool:state.fool,
    handSizes:state.hands.map(h=>h.length),myHand:ownCards,
    legalMoves:Date.now()<(state.dealReadyAt??0)?[]:legalDurakMoves(state,seat),seat,revision:version,
    dealStartedAt:state.dealStartedAt,dealReadyAt:state.dealReadyAt,dealServerNow:Date.now(),
    finishOrder:state.finishOrder??[],finishOrderComplete:state.finishOrderComplete??false,
    attackSeats:Date.now()<(state.dealReadyAt??0)?[]:durakAttackSeats(state),
    presentationSequence:state.presentationSequence??0,events:publicDurakEvents(state,body.presentationVersion)
  };
  return respond({ok:true,game:view});
 }catch(err){
  console.error("DURAK request failure",err instanceof Error?err.name:"unknown");
  return respond({ok:false,code:"SERVICE_UNAVAILABLE"},503);
 }
});
