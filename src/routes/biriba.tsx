import {createFileRoute} from "@tanstack/react-router";
import {useCallback,useEffect,useMemo,useState} from "react";
import {PlayerSessionGate} from "@/components/joker/PlayerSessionGate";
import {PlayerAvatar} from "@/components/joker/PlayerAvatar";
import {ScreenShell} from "@/components/joker/ScreenShell";
import {TableSurface} from "@/components/table/TableSurface";
import {BiribaPixiPreview} from "@/biriba/BiribaPixiPreview";
import {biribaCommand,type BiribaRoomView,type BiribaGameView,type BiribaResponse} from "@/services/biribaFunctions";
import {BIRIBA_TARGETS,DEFAULT_BIRIBA_TARGET,type BiribaCard,type BiribaMeld,type BiribaSeatCount,type BiribaTarget,type BiribaRank} from "@/biriba/rules";
import {assets} from "@/assets/registry";

export const Route=createFileRoute("/biriba")({
 head:()=>({meta:[{title:"ΜΠΙΡΙΜΠΑ — Online παιχνίδι"}]}),component:BiribaHome
});
function BiribaHome(){
 return <PlayerSessionGate allowLogout={false}>{player=><BiribaContent playerId={player.id}/>}</PlayerSessionGate>;
}
const ranks:Record<number,string>={1:"A",11:"J",12:"Q",13:"K"};
const names:Record<string,string>={spades:"♠",hearts:"♥",diamonds:"♦",clubs:"♣"};
const label=(c:BiribaCard)=>c.joker?"JOKER":(ranks[c.rank]??c.rank)+names[c.suit];
const format=(r:BiribaResponse)=>r.ok?"":({
 ACTIVE_GAME_EXISTS:"Έχεις ήδη άλλο ενεργό παιχνίδι. Ολοκλήρωσέ το πρώτα.",
 ROOM_NOT_FOUND:"Το δωμάτιο δεν βρέθηκε.",ROOM_FULL:"Το δωμάτιο είναι γεμάτο.",
 HOST_ONLY:"Η ενέργεια επιτρέπεται μόνο στον δημιουργό.",ILLEGAL_MOVE:"Μη επιτρεπτή κίνηση.",
 SERVICE_UNAVAILABLE:"Ο διακομιστής Μπιρίμπας δεν είναι διαθέσιμος ακόμη.",
 NOT_AUTHENTICATED:"Χρειάζεται νέα σύνδεση.",
 } as Record<string,string>)[r.code]??"Η ενέργεια δεν ολοκληρώθηκε.";
function selectedMeld(cards:BiribaCard[],seat:number):BiribaMeld|null{
 if(cards.length<3||cards.some(c=>c.joker))return null;
 const natural=cards as Array<Extract<BiribaCard,{joker?:false}>>;
 const suit=natural[0]!.suit;
 if(natural.some(c=>c.suit!==suit))return null;
 const ordered=[...natural].sort((a,b)=>a.rank-b.rank);
 if(!ordered.every((c,i)=>i===0||c.rank===ordered[i-1]!.rank+1))return null;
 return {ownerSeat:seat,suit,highAce:false,cards:ordered.map(c=>({card:c,value:c.rank}))};
}
function BiribaContent({playerId}:{playerId:string}){
 const [capacity,setCapacity]=useState<BiribaSeatCount>(4);
 const [target,setTarget]=useState<BiribaTarget>(DEFAULT_BIRIBA_TARGET);
 const [mode,setMode]=useState<"create"|"join">("create");
 const [room,setRoom]=useState<BiribaRoomView|null>(null);
 const [available,setAvailable]=useState<Array<{code:string;capacity:BiribaSeatCount;target:number;hostName:string;occupied:number}>>([]);
 const [game,setGame]=useState<BiribaGameView|null>(null);
 const [selected,setSelected]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const isHost=room?.hostPlayerId===playerId;
 const run=useCallback(async(data:Parameters<typeof biribaCommand>[0]["data"])=>{
  setBusy(true);setError("");
  try{
   const r=await biribaCommand({data});
   if(!r.ok){setError(format(r));return;}
   if("room" in r){setRoom(r.room);setGame(null)}
   if("rooms" in r)setAvailable(r.rooms);
   if("game" in r)setGame(r.game);
   if("cancelled" in r){setRoom(null);setGame(null)}
   if("started" in r||"updated" in r){
    if(room?.code){
     const changed=await biribaCommand({data:{action:"get",code:room.code}});
     if(changed.ok&&"room" in changed)setRoom(changed.room);
    }
   }
  }catch{setError("Δεν ήταν δυνατή η σύνδεση με τον server.");}
  finally{setBusy(false);}
 },[room?.code]);
 useEffect(()=>{
  let active=true;
  void biribaCommand({data:{action:"membership"}}).then(async r=>{
   if(!active||!r.ok||!("membership" in r)||!r.membership)return;
   const found=await biribaCommand({data:{action:"get",code:r.membership.code}});
   if(active&&found.ok&&"room" in found)setRoom(found.room);
  }).catch(()=>{});
  return ()=>{active=false};
 },[]);
 const code=room?.code;
 useEffect(()=>{
  if(!code)return;
  let current=true;const poll=async()=>{
   try{
    const result=await biribaCommand({data:{action:"get",code}});
    if(!current)return;
    if(result.ok&&"room" in result)setRoom(r=>r?.version&&r.version>result.room.version?r:result.room);
    if(result.ok&&"room" in result&&result.room.lifecycle!=="waiting"){
     const next=await biribaCommand({data:{action:"get_game",code}});
     if(current&&next.ok&&"game" in next)setGame(next.game);
    }
   }catch{/* retry on next interval */}
  };
  void poll();const timer=setInterval(()=>void poll(),900);
  return ()=>{current=false;clearInterval(timer)};
 },[code]);
 const ownCards=game?.myHand??[];
 const preview=useMemo(()=>{
  if(!game)return undefined;
  const hands:Array<BiribaCard[]>=Array.from({length:game.seats},()=>[]);
  hands[0]=game.myHand;
  return {seats:game.seats,hands,packets:[[],[]] as [BiribaCard[],BiribaCard[]],stock:[],discard:game.discards,trump:game.trump};
 },[game]);
 const toggle=(id:string)=>setSelected(s=>s.includes(id)?s.filter(v=>v!==id):[...s,id]);
 const play=async(move:unknown)=>{
  if(!code)return;
  setError("");setBusy(true);
  try{
   const result=await biribaCommand({data:{action:"move",code,move}});
   if(!result.ok){setError(format(result));return;}
   if("game" in result){setGame(result.game);setSelected([])}
  }catch{setError("Αποτυχία επικοινωνίας με τον server.");}
  finally{setBusy(false)}
 };
 if(room&&room.lifecycle!=="waiting"){
  const mine=game?.turn===game?.seat&&!game?.roundEnded;
  const selectedCards=ownCards.filter(c=>selected.includes(c.id));
  const candidate=game?selectedMeld(selectedCards,game.seat):null;
  return <main className="relative h-[100dvh] w-full overflow-hidden bg-[#0b241b]">
   <TableSurface/><BiribaPixiPreview deal={preview}/>
   <div className="absolute left-3 top-3 z-20 rounded-lg bg-black/80 p-2 text-xs text-white">
    <div>ΜΠΙΡΙΜΠΑ · {room.code} · {room.target.toLocaleString("el-GR")} πόντοι</div>
    <div>{game?.roundEnded?"Τέλος γύρου":game? `Σειρά θέσης ${game.turn+1} · ${game.phase==="draw"?"Τράβηγμα":"Κατέβασμα / Πέταγμα"}`:"Φόρτωση παρτίδας…"}</div>
    <div>Τράπουλα: {game?.stockCount??"…"} · Ατού: {game?.trump?names[game.trump]:"—"}</div>
   </div>
   <div className="absolute right-3 top-3 z-20 flex gap-2">
    {isHost&&<button type="button" className="rounded bg-black/80 px-3 py-2 text-xs text-white" onClick={()=>void run({action:"end_game",code:room.code})}>Τέλος παιχνιδιού</button>}
   </div>
   <div className="absolute bottom-1 left-1/2 z-30 w-[min(94vw,750px)] -translate-x-1/2 rounded-lg border border-white/15 bg-black/85 p-2 text-white">
    {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
    <div className="flex flex-wrap justify-center gap-1 text-sm">
     {ownCards.map(card=><button type="button" key={card.id} disabled={!mine||busy}
      aria-pressed={selected.includes(card.id)} onClick={()=>toggle(card.id)}
      className={`rounded border px-2 py-1 ${selected.includes(card.id)?"border-amber-400 bg-amber-500/30":"border-white/25"}`}>{label(card)}</button>)}
    </div>
    <div className="mt-2 flex justify-center gap-2">
     {mine&&game?.phase==="draw"&&<button className="rounded bg-emerald-700 px-3 py-2 text-xs" disabled={busy} onClick={()=>void play({type:"draw"})}>Τράβηγμα</button>}
     {mine&&game?.phase==="meld"&&<>
      <button className="rounded bg-blue-700 px-3 py-2 text-xs" disabled={busy||!candidate} onClick={()=>candidate&&void play({type:"meld",meld:candidate})}>Κατέβασμα επιλεγμένων</button>
      <button className="rounded bg-red-700 px-3 py-2 text-xs" disabled={busy||selected.length!==1} onClick={()=>void play({type:"discard",id:selected[0]})}>Πέταγμα</button>
     </>}
    </div>
   </div>
  </main>;
 }
 return <ScreenShell title="ΜΠΙΡΙΜΠΑ" variant="pregame" contentClassName="!overflow-y-auto !min-h-0 pb-8">
  <div className="mx-auto w-full max-w-2xl space-y-3 rounded-xl border border-primary/25 p-4">
   {error&&<p role="alert" className="text-red-400">{error}</p>}
   {!room&&<div className="grid grid-cols-2 gap-2">
    <button className="rounded-lg border p-3 font-semibold" type="button" aria-pressed={mode==="create"} onClick={()=>setMode("create")}>Δημιουργία</button>
    <button className="rounded-lg border p-3 font-semibold" type="button" aria-pressed={mode==="join"} onClick={()=>{setMode("join");void run({action:"list"})}}>Συμμετοχή</button>
   </div>}
   {room?<section className="space-y-3">
    <h2 className="text-xl font-bold">Δωμάτιο {room.code}</h2>
    <p>{room.capacity} παίκτες · {room.target.toLocaleString("el-GR")} πόντοι</p>
    <div className="grid grid-cols-2 gap-2">{room.seats.map(seat=><div key={seat.index} className="flex items-center gap-2 rounded border p-2">
     <PlayerAvatar name={seat.name??"Κενή θέση"} imageUrl={seat.name?assets.avatar("",seat.name):undefined} isBot={seat.occupant==="bot"} size="sm"/>
     <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{seat.name??"Κενή θέση"}</div>
      <div className="text-xs">{seat.occupant==="bot"?"⭐".repeat(seat.tier??1):seat.occupant==="human"?"Παίκτης":"Αναμονή"}</div>
     </div>
     {isHost&&seat.occupant==="empty"&&<button type="button" disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={()=>void run({action:"bot_add",code:room.code,seat:seat.index})}>+ Bot</button>}
     {isHost&&seat.occupant==="bot"&&<button type="button" disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={()=>void run({action:"bot_remove",code:room.code,seat:seat.index})}>− Bot</button>}
    </div>)}</div>
    {isHost&&<button type="button" disabled={busy} className="w-full rounded bg-primary/25 p-3 font-bold" onClick={()=>void run({action:"start",code:room.code})}>Έναρξη (αυτόματη συμπλήρωση με bots)</button>}
    <button className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={()=>void run({action:"leave",code:room.code})}>Έξοδος</button>
   </section>:mode==="create"?<div className="space-y-3">
    <label className="block">Παίκτες<select className="mt-1 w-full rounded bg-secondary p-3" value={capacity} onChange={e=>setCapacity(Number(e.target.value) as BiribaSeatCount)}><option value={2}>2</option><option value={4}>4</option></select></label>
    <label className="block">Στόχος<select className="mt-1 w-full rounded bg-secondary p-3" value={target} onChange={e=>setTarget(Number(e.target.value) as BiribaTarget)}>{BIRIBA_TARGETS.map(v=><option key={v} value={v}>{v.toLocaleString("el-GR")} πόντοι</option>)}</select></label>
    <button className="w-full rounded border border-primary/50 bg-primary/20 p-3 font-semibold" disabled={busy} onClick={()=>void run({action:"create",capacity,target})}>Δημιουργία παιχνιδιού</button>
   </div>:<div className="space-y-3">
    <button type="button" className="rounded border p-2" disabled={busy} onClick={()=>void run({action:"list"})}>Ανανέωση</button>
    {available.length===0&&<p className="text-sm">Δεν υπάρχουν ανοιχτά δωμάτια.</p>}
    {available.map(item=><div key={item.code} className="flex items-center justify-between rounded border p-3 text-sm">
      <span>{item.hostName} · {item.occupied}/{item.capacity} · {item.target.toLocaleString("el-GR")}</span>
      <button className="rounded bg-primary/20 p-2" disabled={busy} onClick={()=>void run({action:"join",code:item.code})}>Συμμετοχή</button>
    </div>)}
   </div>}
   <a className="inline-block rounded border px-3 py-2 text-sm" href="/">← Επιλογή παιχνιδιού</a>
  </div>
 </ScreenShell>;
}
