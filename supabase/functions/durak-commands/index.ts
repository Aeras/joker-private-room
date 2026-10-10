import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});

Deno.serve(async(req:Request)=>{
 if(req.method!=="POST") return respond({ok:false,code:"INVALID_ACTION"},405);
 try{
  const body=await req.json();
  const token=typeof body?.sessionToken==="string"?body.sessionToken:"";
  const action=typeof body?.action==="string"?body.action:"";
  if(!/^[0-9a-f]{64}$/i.test(token)) return respond({ok:false,code:"NOT_AUTHENTICATED"},401);
  if(!["create","join","leave","get","list","membership"].includes(action)) return respond({ok:false,code:"INVALID_ACTION"},400);
  const code=typeof body?.code==="string"?body.code.toUpperCase():"";
  if(["join","leave","get"].includes(action) && !/^[A-Z0-9]{6}$/.test(code))
    return respond({ok:false,code:"INVALID_OPTIONS"},400);
  const variant=body?.variant;
  const capacity=body?.capacity;
  if(action==="create"&&(!["podkidnoy","perevodnoy"].includes(variant)||!Number.isInteger(capacity)||capacity<2||capacity>6))
    return respond({ok:false,code:"INVALID_OPTIONS"},400);
  const url=Deno.env.get("SUPABASE_URL");
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key) return respond({ok:false,code:"SERVICE_UNAVAILABLE"},503);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await admin.rpc("durak_room_command_internal",{
    p_session_token:token,p_action:action,p_code:code||null,
    p_variant:action==="create"?variant:null,p_capacity:action==="create"?capacity:null
  });
  if(error){console.error("DURAK RPC failure",error.code);return respond({ok:false,code:"SERVICE_UNAVAILABLE"},503);}
  const result=data&&typeof data==="object"?data:{ok:false,code:"SERVICE_UNAVAILABLE"};
  const status=result.ok===true?200:result.code==="NOT_AUTHENTICATED"?401:result.code==="NOT_A_MEMBER"?403:
    ["ACTIVE_GAME_EXISTS","ROOM_FULL","ROOM_ALREADY_STARTED"].includes(result.code)?409:400;
  return respond(result,status);
 }catch{ return respond({ok:false,code:"SERVICE_UNAVAILABLE"},503);}
});
