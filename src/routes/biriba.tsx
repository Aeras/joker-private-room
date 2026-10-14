import {createFileRoute} from "@tanstack/react-router";
import {useCallback,useEffect,useMemo,useState} from "react";
import {ChartNoAxesColumn} from "lucide-react";
import {PlayerSessionGate} from "@/components/joker/PlayerSessionGate";
import {PlayerAvatar} from "@/components/joker/PlayerAvatar";
import {ScreenShell} from "@/components/joker/ScreenShell";
import {TableSurface} from "@/components/table/TableSurface";
import {BiribaPixiPreview} from "@/biriba/BiribaPixiPreview";
import {biribaCommand,type BiribaRoomView,type BiribaGameView,type BiribaResponse} from "@/services/biribaFunctions";
import {BIRIBA_TARGETS,DEFAULT_BIRIBA_TARGET,type BiribaCard,type BiribaMeld,type BiribaSeatCount,type BiribaTarget} from "@/biriba/rules";
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
 const [clockNow,setClockNow]=useState(Date.now());
 useEffect(()=>{const t=setInterval(()=>setClockNow(Date.now()),350);return()=>clearInterval(t)},[]);
 const [error,setError]=useState("");
 const [scoresOpen,setScoresOpen]=useState(false);
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
     if(current&&next.ok&&"game" in next)setGame(previous=>previous?.revision===next.game.revision?previous:next.game);
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
  const mine=game?.turn===game?.seat&&!game?.roundEnded&&!game?.clock.botTakeovers.includes(game?.seat??-1)&&game?.clock.pausedBy===null;
  const selectedCards=ownCards.filter(c=>selected.includes(c.id));
  const candidate=game?selectedMeld(selectedCards,game.seat):null;
  return <main className="relative h-[100dvh] w-full overflow-hidden bg-[#0b241b]">
   <TableSurface/><BiribaPixiPreview deal={preview} game={game??undefined} redTeam={parseInt(room.code[0]??"0",16)%2}/>
   <div className="absolute left-3 top-3 z-20 rounded-lg bg-black/80 p-2 text-xs text-white">
    <div>ΜΠΙΡΙΜΠΑ · {room.code} · {room.target.toLocaleString("el-GR")} πόντοι</div>
    <div>{game?.roundEnded?"Τέλος γύρου":game? `Σειρά θέσης ${game.turn+1} · ${game.phase==="draw"?"Τράβηγμα":"Κατέβασμα / Πέταγμα"}`:"Φόρτωση παρτίδας…"}</div>
    <div>Τράπουλα: {game?.stockCount??"…"} · Ατού: {game?.trump?names[game.trump]:"—"}</div>
   </div>
   {game&&<div className="absolute left-3 bottom-3 z-30 flex items-center gap-2 rounded-xl border border-white/20 bg-black/85 p-2 text-xs text-white">
    <button type="button" aria-label={game.clock.pausedBy===game.seat?"Συνέχεια παρτίδας":"Παύση παρτίδας"}
     disabled={busy||(!game.clock.botTakeovers.includes(game.seat)&&game.clock.pausedBy!==game.seat&&game.turn!==game.seat)||game.clock.botTakeovers.includes(game.seat)||game.clock.pausedBy!==null&&game.clock.pausedBy!==game.seat||game.clock.pausesUsed[game.seat]>=3&&game.clock.pausedBy!==game.seat}
     className="relative" onClick={()=>void run({action:game.clock.pausedBy===game.seat?"resume":"pause",code:room.code})}>
      <PlayerAvatar name={room.seats.find(s=>s.index===game.seat)?.name??"Εσύ"} imageUrl={assets.avatar("",room.seats.find(s=>s.index===game.seat)?.name??"")} size="sm"/>
      {game.clock.pausedBy===game.seat&&<span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-lg">Ⅱ</span>}
    </button>
    <div>
     <div>{game.clock.pausedBy!==null?"ΠΑΥΣΗ":Math.max(0,Math.ceil((game.clock.turnDeadline-clockNow)/1000))+"″"}</div>
     <div>Παύσεις {game.clock.pausesUsed[game.seat]??0}/3</div>
    </div>
    {game.clock.botTakeovers.includes(game.seat)&&<button type="button" disabled={busy} className="rounded border border-amber-400 px-2 py-1 text-amber-200" onClick={()=>void run({action:"reclaim",code:room.code})}>Πάρε τον έλεγχο</button>}
   </div>}
   <div className="absolute right-3 top-3 z-30 flex gap-2">
    <button type="button" aria-label="Αναλυτική βαθμολογία" className="rounded bg-black/85 p-2 text-white" onClick={()=>setScoresOpen(open=>!open)}><ChartNoAxesColumn size={20}/></button>
    {isHost&&<button type="button" className="rounded bg-black/80 px-3 py-2 text-xs text-white" onClick={()=>void run({action:"end_game",code:room.code})}>Τέλος παιχνιδιού</button>}
   </div>
   {scoresOpen&&game&&<section className="absolute right-3 top-14 z-40 max-h-[72vh] w-[min(90vw,470px)] overflow-y-auto rounded-xl border border-white/20 bg-[#111c1a]/95 p-3 text-white shadow-2xl">
     <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">Αναλυτική βαθμολογία</h2><button type="button" className="rounded border border-white/30 px-2 py-1 text-xs" onClick={()=>setScoresOpen(false)}>Κλείσιμο</button></div>
     <div className="mb-3 grid grid-cols-2 gap-2 text-center text-sm">
      <div className="rounded-lg border border-red-400 p-2">Κόκκινη ομάδα <strong className="block text-lg">{game.teamScores[parseInt(room.code[0]??"0",16)%2]}</strong></div>
      <div className="rounded-lg border border-blue-400 p-2">Μπλε ομάδα <strong className="block text-lg">{game.teamScores[1-parseInt(room.code[0]??"0",16)%2]}</strong></div>
     </div>
     {game.scoreHistory.length===0&&<p className="text-sm text-white/70">Ο πρώτος γύρος βρίσκεται σε εξέλιξη.</p>}
     {[...game.scoreHistory].reverse().map(item=><div key={item.round} className="mb-3 space-y-2 rounded-lg border border-white/20 p-2 text-xs">
      <strong>Γύρος {item.round}</strong>
      <div className="grid grid-cols-2 gap-2">{item.breakdown.map((b,team)=><div key={team} className="space-y-1">
       <strong>Ομάδα {team+1}: {b.total>0?"+":""}{b.total}</strong>
       <div>Κατεβασμένα: +{b.cards}</div><div>Μπιρίμπες: +{b.bonuses}</div>
       <div>Κλείσιμο: +{b.closing}</div><div>Ποινές: −{b.penalty}</div>
       <div>Στο χέρι: −{b.held}</div>
      </div>)}</div>
      <div className="border-t border-white/20 pt-2">{item.playerPoints.map(p=><div key={p.seat}>
       {room.seats[p.seat]?.name??`Παίκτης ${p.seat+1}`}: +{p.cards} / −{p.held} φύλλα
      </div>)}</div>
     </div>)}
     {game.roundScored&&!game.matchFinished&&isHost&&<button type="button" disabled={busy} onClick={()=>void run({action:"next_round",code:room.code})} className="w-full rounded bg-emerald-700 px-3 py-2 font-bold">Επόμενος γύρος</button>}
     {game.matchFinished&&<p className="rounded bg-amber-400/15 p-2 font-semibold">Τέλος παιχνιδιού · Νίκη ομάδας {(game.winnerTeam??0)+1}</p>}
   </section>}
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
