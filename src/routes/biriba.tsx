import {createFileRoute} from "@tanstack/react-router";
import {useCallback,useEffect,useMemo,useState} from "react";
import {ChartNoAxesColumn} from "lucide-react";
import {PlayerSessionGate} from "@/components/joker/PlayerSessionGate";
import {PlayerAvatar} from "@/components/joker/PlayerAvatar";
import {ScreenShell} from "@/components/joker/ScreenShell";
import {TableSurface} from "@/components/table/TableSurface";
import {BiribaPixiPreview} from "@/biriba/BiribaPixiPreview";
import {biribaCommand,type BiribaRoomView,type BiribaGameView,type BiribaResponse} from "@/services/biribaFunctions";
import {BIRIBA_TARGETS,DEFAULT_BIRIBA_TARGET,type BiribaCard,type BiribaMeld,type BiribaSeatCount,type BiribaTarget,biribaMeldValid,biribaTeamOf} from "@/biriba/rules";
import {assets} from "@/assets/registry";
import { NORMAL_DEAL_STAGGER_MS,NORMAL_DEAL_TRAVEL_MS,NORMAL_DEAL_HANDOFF_TRAVEL_MS,NORMAL_DEAL_HANDOFF_FADE_MS,LOCAL_HAND_ENTRANCE_MS,LOCAL_HAND_FLIP_MS } from "@/components/table/presentationTiming";

export const Route=createFileRoute("/biriba")({
 head:()=>({meta:[{title:"ΜΠΙΡΙΜΠΑ — Online παιχνίδι"}]}),component:BiribaHome
});
function BiribaHome(){
 return <PlayerSessionGate allowLogout={false}>{player=><BiribaContent playerId={player.id}/>}</PlayerSessionGate>;
}
const ranks:Record<number,string>={1:"A",11:"J",12:"Q",13:"K"};
const names:Record<string,string>={spades:"♠",hearts:"♥",diamonds:"♦",clubs:"♣"};
const label=(c:BiribaCard)=>c.joker?"JOKER":(ranks[c.rank]??c.rank)+(names[c.suit]??"");
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
function legalExtension(meld:BiribaMeld,cards:BiribaCard[]):BiribaMeld|null{
 if(cards.length!==1||cards[0]?.joker)return null;
 const card=cards[0] as Extract<BiribaCard,{joker?:false}>;
 if(card.suit!==meld.suit)return null;
 const first=meld.cards[0]?.value,last=meld.cards[meld.cards.length-1]?.value;
 const proposal=card.rank===Number(first)-1
  ?{...meld,cards:[{card,value:card.rank},...meld.cards]}
  :card.rank===Number(last)+1?{...meld,cards:[...meld.cards,{card,value:card.rank}]}:null;
 return proposal&&biribaMeldValid(proposal)?proposal:null;
}
function BiribaContent({playerId}:{playerId:string}){
 const [capacity,setCapacity]=useState<BiribaSeatCount>(4);
 const [target,setTarget]=useState<BiribaTarget>(DEFAULT_BIRIBA_TARGET);
 const [timerEnabled,setTimerEnabled]=useState(true);
 const [mode,setMode]=useState<"create"|"join">("create");
 const [room,setRoom]=useState<BiribaRoomView|null>(null);
 const [available,setAvailable]=useState<Array<{code:string;capacity:BiribaSeatCount;target:number;hostName:string;timerEnabled:boolean;occupied:number}>>([]);
 const [game,setGame]=useState<BiribaGameView|null>(null);
 const [selected,setSelected]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [clockNow,setClockNow]=useState(Date.now());
 useEffect(()=>{const t=setInterval(()=>setClockNow(Date.now()),350);return()=>clearInterval(t)},[]);
 const [error,setError]=useState("");
 const [scoresOpen,setScoresOpen]=useState(false);
 const [dealShownKey,setDealShownKey]=useState<string|null>(null);
 const dealKey=game?`${game.roundNumber}:${game.seat}`:null;
 const initialDealView=useMemo(()=>{
  if(!game)return null;
  return {key:dealKey,game};
 // First complete server snapshot after each round starts drives the dealing presentation.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[dealKey]);
 const onDealComplete=useCallback((key:string)=>setDealShownKey(key),[]);
 useEffect(()=>{
  if(!dealKey||!game)return;
  // Fallback when a browser is backgrounded and Pixi's frame clock is throttled.
  const t=setTimeout(()=>setDealShownKey(dealKey),(11*game.seats-1)*NORMAL_DEAL_STAGGER_MS+NORMAL_DEAL_TRAVEL_MS+NORMAL_DEAL_HANDOFF_TRAVEL_MS+NORMAL_DEAL_HANDOFF_FADE_MS+LOCAL_HAND_ENTRANCE_MS+LOCAL_HAND_FLIP_MS+800);
  return()=>clearTimeout(t);
 },[dealKey,game?.seats]);
 const isHost=room?.hostPlayerId===playerId;
 const run=useCallback(async(data:Parameters<typeof biribaCommand>[0]["data"])=>{
  setBusy(true);setError("");
  try{
   const r=await biribaCommand({data});
   if(!r.ok){setError(format(r));return;}
   if("room" in r){setRoom(r.room);setGame(null);setDealShownKey(null)}
   if("rooms" in r)setAvailable(r.rooms);
   if("game" in r)setGame(r.game);
   if("cancelled" in r){setRoom(null);setGame(null);setDealShownKey(null)}
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
 const visualGame=dealShownKey===dealKey?game:initialDealView?.game??game;
 const preview=useMemo(()=>{
  if(!visualGame)return undefined;
  const hands:Array<BiribaCard[]>=Array.from({length:visualGame.seats},()=>[]);
  hands[0]=visualGame.myHand;
  return {seats:visualGame.seats,hands,packets:[[],[]] as [BiribaCard[],BiribaCard[]],stock:[],discard:visualGame.discards,trump:visualGame.trump};
 },[visualGame]);
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
  const mine=dealShownKey===dealKey&&game?.turn===game?.seat&&!game?.roundEnded&&!game?.clock.botTakeovers.includes(game?.seat??-1)&&game?.clock.pausedBy===null;
  const selectedCards=ownCards.filter(c=>selected.includes(c.id));
  const candidate=game?selectedMeld(selectedCards,game.seat):null;
  const pickup=game?.discards.map(discard=>({discard,meld:selectedMeld([...selectedCards,discard],game.seat)})).find(item=>item.meld);
  const team=game?biribaTeamOf(game.seat,game.seats):null;
  const extensions=game?.melds.map((meld,index)=>({index,kind:legalExtension(meld,selectedCards),ownerSeat:meld.ownerSeat})).filter(x=>x.kind&&team===biribaTeamOf(x.ownerSeat,game.seats)&&
     (x.ownerSeat===game.seat||game.opened[game.seat]))??[];

  return <main className="relative h-[100dvh] w-full overflow-hidden bg-[#0b241b]">
   <TableSurface/><BiribaPixiPreview deal={preview} game={visualGame??undefined} revealComplete={dealShownKey===dealKey} onDealComplete={onDealComplete} redTeam={((room.code.charCodeAt(0)||0)%2)}/>
   {game&&<div className="pointer-events-none absolute bottom-1 left-2 z-40 flex items-center gap-2">
     <PlayerAvatar name={room.seats.find(seat=>seat.index===game.seat)?.name??"Εσύ"} imageUrl={assets.avatar("",room.seats.find(seat=>seat.index===game.seat)?.name??"")} size="md"/>
    </div>}
   {/* Seats are anchored to the actual screen edges. Local hand remains at bottom. */}
   {game&&[...(game.seats===4?[1,2,3]:[1])].map(delta=>{
    const seatIndex=(game.seat+delta)%game.seats;
    const seat=game.roomSeats[seatIndex];
    const position=game.seats===2||delta===2?"left-[59%] top-[2%]":delta===1?"left-[4%] top-[39%]":"right-[4%] top-[39%]";
    return <div key={seatIndex} className={`pointer-events-none absolute z-20 flex flex-col items-center gap-1 ${position}`}>
     <PlayerAvatar name={seat?.name??"Παίκτης"} imageUrl={seat?.name?assets.avatar("",seat.name):undefined} isBot={seat?.occupant==="bot"} size="sm"/>
     <span className="max-w-[115px] truncate rounded bg-black/60 px-1 text-center text-[10px] text-white">{seat?.name??"Παίκτης"}</span>
    </div>;
   })}

   <div className="absolute left-3 top-3 z-20 rounded-lg bg-black/80 p-2 text-xs text-white">
    <div>ΜΠΙΡΙΜΠΑ · {room.code} · {room.target.toLocaleString("el-GR")} πόντοι</div>
    <div>{game?.roundEnded?"Τέλος γύρου":game? `Σειρά θέσης ${game.turn+1} · ${game.phase==="draw"?"Τράβηγμα":"Κατέβασμα / Πέταγμα"}`:"Φόρτωση παρτίδας…"}</div>
    <div>Τράπουλα: {game?.stockCount??"…"} · Ατού: {game?.trump?names[game.trump]:"—"}</div>
   </div>
   {game&&room.timerEnabled&&<div className="absolute left-3 bottom-3 z-30 flex items-center gap-2 rounded-xl border border-white/20 bg-black/85 p-2 text-xs text-white">
    <button type="button" aria-label={game.clock.pausedBy===game.seat?"Συνέχεια παρτίδας":"Παύση παρτίδας"}
     disabled={busy||(!game.clock.botTakeovers.includes(game.seat)&&game.clock.pausedBy!==game.seat&&game.turn!==game.seat)||game.clock.botTakeovers.includes(game.seat)||game.clock.pausedBy!==null&&game.clock.pausedBy!==game.seat||(game.clock.pausesUsed[game.seat]??0)>=3&&game.clock.pausedBy!==game.seat}
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
   <div className="absolute bottom-0 left-1/2 z-30 w-[min(98vw,950px)] -translate-x-1/2 text-white">
    {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
    <div className="mb-2 flex flex-wrap justify-center gap-2">
     {mine&&game?.phase==="draw"&&<button className="rounded bg-emerald-700 px-3 py-2 text-xs" disabled={busy} onClick={()=>void play({type:"draw"})}>Τράβηγμα</button>}
     {mine&&game?.phase==="draw"&&pickup?.meld&&<button className="rounded bg-amber-700 px-3 py-2 text-xs" disabled={busy} onClick={()=>void play({type:"pickup",ids:[pickup.discard.id],meld:pickup.meld})}>Πάρε πεταμένα &amp; κατέβασε</button>}
     {mine&&game?.phase==="meld"&&<>
      <button className="rounded bg-blue-700 px-3 py-2 text-xs" disabled={busy||!candidate} onClick={()=>candidate&&void play({type:"meld",meld:candidate})}>Κατέβασμα επιλεγμένων</button>
      {extensions.map(item=><button key={item.index} type="button" disabled={busy} className="rounded bg-amber-700 px-3 py-2 text-xs" onClick={()=>item.kind&&void play({type:"extend",index:item.index,meld:item.kind})}>Κόλλημα #{item.index+1}</button>)}
      <button className="rounded bg-red-700 px-3 py-2 text-xs" disabled={busy||selected.length!==1} onClick={()=>void play({type:"discard",id:selected[0]})}>Πέταγμα</button>
     </>}
    </div>
    <div className="flex items-end justify-center gap-0 overflow-visible pb-1 text-sm">
     {dealShownKey===dealKey&&ownCards.map((card,i)=><button type="button" key={card.id} disabled={!mine||busy}
      aria-pressed={selected.includes(card.id)} onClick={()=>toggle(card.id)}
      style={{marginLeft:ownCards[0]===card?0:"clamp(-24px,-2.5vw,-9px)",transform:selected.includes(card.id)?"translateY(-14px)":"none",zIndex:selected.includes(card.id)?50:1}} className={`relative h-[clamp(60px,18vh,125px)] w-[clamp(44px,12vh,86px)] overflow-hidden rounded-md border-2 bg-white shadow-lg transition-transform ${selected.includes(card.id)?"border-amber-400 ring-2 ring-amber-400":"border-zinc-300"}`}><img draggable={false} className="biriba-hand-face h-full w-full object-fill" style={{animationDelay:`${i*32}ms`}} src={card.joker?"/cards/optimized-png/faces/joker_red.png":`/cards/optimized-png/faces/${card.suit}_${({1:"ace",11:"jack",12:"queen",13:"king"} as Record<number,string>)[card.rank]??card.rank}.png`} alt={label(card)}/></button>)}
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
    <p>{room.capacity} παίκτες · {room.target.toLocaleString("el-GR")} πόντοι · Χρονόμετρο {room.timerEnabled?"ON":"OFF"}</p>
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
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_auto] items-end gap-2">
     <label className="min-w-0 text-xs sm:text-sm">Παίκτες<select className="mt-1 w-full rounded bg-secondary px-2 py-3 text-sm" value={capacity} onChange={e=>setCapacity(Number(e.target.value) as BiribaSeatCount)}><option value={2}>2</option><option value={4}>4</option></select></label>
     <label className="min-w-0 text-xs sm:text-sm">Στόχος<select className="mt-1 w-full rounded bg-secondary px-2 py-3 text-sm" value={target} onChange={e=>setTarget(Number(e.target.value) as BiribaTarget)}>{BIRIBA_TARGETS.map(v=><option key={v} value={v}>{v.toLocaleString("el-GR")}</option>)}</select></label>
     <label className="flex min-w-[85px] cursor-pointer flex-col items-center gap-2 text-center text-xs sm:text-sm">Χρονόμετρο
      <span className="relative inline-flex h-6 w-11 items-center">
       <input type="checkbox" role="switch" aria-label="Χρονόμετρο" checked={timerEnabled} onChange={e=>setTimerEnabled(e.target.checked)} className="peer sr-only"/>
       <span className="absolute inset-0 rounded-full bg-zinc-600 transition-colors peer-checked:bg-emerald-600"/>
       <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"/>
      </span>
     </label>
    </div>
    <p className="text-xs text-muted-foreground">{timerEnabled?"60 δευτερόλεπτα ανά πραγματικό παίκτη, με 3 προσωπικές παύσεις και προσωρινό bot στη λήξη.":"Απεριόριστος χρόνος για πραγματικούς παίκτες, χωρίς χρονόμετρο ή αυτόματο bot λόγω καθυστέρησης."}</p>
    <button className="w-full rounded border border-primary/50 bg-primary/20 p-3 font-semibold" disabled={busy} onClick={()=>void run({action:"create",capacity,target,timerEnabled})}>Δημιουργία παιχνιδιού</button>
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
