import { useCallback, useEffect, useMemo, useState } from "react";
import { assets } from "@/assets/registry";
import { PlayerAvatar } from "@/components/joker/PlayerAvatar";
import { durakRoomCommand, type DurakGameView } from "@/services/durakRoomFunctions";
import { DurakCardBack, DurakCardFace, DurakStock, DurakTableSurface } from "./DurakTableVisuals";
import { DURAK_SEAT_POSITIONS, VARIANT_NAMES, type DurakCard } from "./rules";
import type { DurakMove } from "./engine";
const suitSymbol={clubs:"♣",diamonds:"♦",hearts:"♥",spades:"♠"};
const ident=(c:DurakCard)=>c.suit+":"+c.rank;

export function DurakOnlineTable({code,seats,onBack}:{
 code:string;seats:Array<{index:number;name:string|null;occupant:string}>;onBack:()=>void;
}) {
 const [game,setGame]=useState<DurakGameView|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [target,setTarget]=useState<number|null>(null);
 const fetchState=useCallback(async()=>{
   try{
     const r=await durakRoomCommand({data:{action:"get_game",code}});
     if(r.ok&&"game" in r)setGame(r.game);
     else if(!r.ok&&r.code!=="STATE_CHANGED")setError("Δεν ήταν δυνατή η ενημέρωση της παρτίδας.");
   }catch{setError("Η σύνδεση διακόπηκε. Περιμένουμε επανασύνδεση.");}
 },[code]);
 useEffect(()=>{
   void fetchState();
   const id=setInterval(()=>{void fetchState();},1600);
   return ()=>clearInterval(id);
 },[fetchState]);
 const actions=game?.legalMoves??[];
 const send=async(move:DurakMove)=>{
   setLoading(true);setError("");
   try{
    const r=await durakRoomCommand({data:{action:"move",code,move}});
    if(r.ok&&"game" in r){setGame(r.game);setTarget(null);}
    else {setError("Η κίνηση δεν έγινε δεκτή. Το παιχνίδι θα ενημερωθεί.");await fetchState();}
   }catch{setError("Αδύνατη η αποστολή της κίνησης.");}
   finally{setLoading(false);}
 };
 const playable=useCallback((card:DurakCard)=>actions.filter(m=>"card" in m&&ident(m.card)===ident(card)),[actions]);
 const clickCard=(card:DurakCard)=>{
   const moves=playable(card);
   const defenses=moves.filter(m=>m.type==="defend");
   const selected=defenses.find(m=>m.type==="defend"&&m.pair===target);
   const action=selected??moves.find(m=>m.type==="transfer")??defenses[0]??moves.find(m=>m.type==="attack");
   if(action)void send(action);
   else if(defenses.length>0)setError("Επίλεξε πρώτα την επίθεση που θέλεις να αποκρούσεις.");
 };
 const positions=useMemo(()=>game?DURAK_SEAT_POSITIONS[game.handSizes.length]??[]:[],[game]);
 if(!game)return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#10261c] p-6 text-white">
   <div className="space-y-4 text-center">Φόρτωση παρτίδας DURAK…
     <div><button type="button" onClick={()=>void fetchState()} className="rounded border px-4 py-2">Επανάληψη</button></div>
     <div><button type="button" onClick={onBack} className="text-sm underline">Πίσω στο δωμάτιο</button></div>
     {error&&<p role="alert">{error}</p>}
   </div>
 </div>;
 const n=game.handSizes.length;
 const playerName=(index:number)=>seats.find(s=>s.index===index)?.name??"Παίκτης "+(index+1);
 const others=game.handSizes.map((size,index)=>({index,size,name:playerName(index),
   relative:(index-game.seat+n)%n})).filter(x=>x.index!==game.seat);
 const botImages=["/avatars/bots/tamara.png","/avatars/bots/grisa.png","/avatars/bots/serz.png","/avatars/bots/valeria.png","/avatars/bots/babis.png"];
 const avatarFor=(index:number,name:string)=>{
   const s=seats.find(s=>s.index===index);
   if(s?.occupant==="bot")return botImages[index%botImages.length];
   return assets.avatar("",name);
 };
 const position=(relative:number)=>{
  const pos=positions[relative]??"top";
  const names:Record<string,string>={
   top:"top-[5%] left-1/2 -translate-x-1/2",
   left:"top-1/2 left-[5%] -translate-y-1/2",
   right:"top-1/2 right-[5%] -translate-y-1/2",
   "top-left":"top-[5%] left-[23%] -translate-x-1/2",
   "top-center":"top-[5%] left-1/2 -translate-x-1/2",
   "top-right":"top-[5%] right-[23%] translate-x-1/2",
  };
  return names[pos]??names["top"];
 };
 return <div className="fixed inset-0 z-[90] flex flex-col overflow-hidden bg-[#081d14] text-white" aria-label="Online τραπέζι DURAK">
  <header className="z-10 flex shrink-0 items-center justify-between gap-2 bg-black/65 px-3 py-1.5 text-xs sm:text-sm">
    <span className="min-w-0 truncate font-bold">DURAK · {VARIANT_NAMES[game.variant]} · Γύρος {game.round}</span>
    <div className="flex shrink-0 gap-2"><button type="button" onClick={()=>void fetchState()} className="rounded border px-2 py-1">Ανανέωση</button><button type="button" onClick={onBack} className="rounded border px-2 py-1">Πίσω</button></div>
  </header>
  <div className="relative min-h-0 flex-1 p-1 sm:p-2">
   <DurakTableSurface>
    {others.map(other=><div key={other.index} data-durak-opponent-seat={other.index}
      className={`absolute z-10 flex flex-col items-center gap-0.5 text-center ${position(other.relative)}`}>
      <div className={`rounded-full border border-primary/70 bg-black/75 p-[3px] shadow-xl ${game.defender===other.index||game.attacker===other.index?"ring-2 ring-primary/75":""}`}>
        <PlayerAvatar name={other.name} isBot={seats.find(s=>s.index===other.index)?.occupant==="bot"}
          imageUrl={avatarFor(other.index,other.name)} size="sm"
          className="h-8 w-8 border-0 sm:h-10 sm:w-10"/>
      </div>
      <div className="max-w-32 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white sm:text-xs">
        <span className="block truncate">{other.name}</span>
        <span className="text-amber-200">{game.defender===other.index?"Άμυνα":game.attacker===other.index?"Επίθεση":""} {other.size} φύλλα</span>
      </div>
      <div className="pointer-events-none flex -space-x-3 [--card-w:1.3rem] sm:[--card-w:1.6rem]">
        {Array.from({length:Math.min(other.size,7)},(_,i)=><DurakCardBack key={i}/>)}
      </div>
    </div>)}
    <div className="absolute inset-x-1 top-[23%] bottom-[28%] flex items-center justify-center gap-2 px-1 sm:top-[24%] sm:bottom-[25%] sm:px-4">
      <div className="shrink-0 scale-75 origin-left sm:scale-100"><DurakStock trump={game.trumpCard} remaining={game.stock}/></div>
      <div className="flex max-h-full min-w-0 flex-1 flex-wrap items-center justify-center gap-1 overflow-y-auto [--card-w:2.2rem] sm:[--card-w:3.1rem]">
       {game.pairs.map((pair,i)=><button key={i} type="button" onClick={()=>setTarget(i)} aria-pressed={target===i}
        className={`flex items-center rounded-md border p-1 ${target===i?"border-amber-300 bg-white/20":"border-white/20 bg-black/10"}`}>
        <DurakCardFace card={pair.attack}/>
        {pair.defense&&<span className="-ml-4 translate-y-2 rotate-12"><DurakCardFace card={pair.defense}/></span>}
       </button>)}
       {game.pairs.length===0&&<span className="rounded-xl bg-black/40 px-3 py-2 text-sm">Αναμονή επίθεσης…</span>}
      </div>
    </div>
    <div className="absolute inset-x-0 bottom-0 z-20 px-2 pb-0 sm:px-5">
      <div className="mx-auto mb-1 flex max-w-lg items-center justify-between gap-2 rounded-lg bg-black/80 px-2 py-1 text-xs">
       <span className="truncate font-semibold">{playerName(game.seat)} · {game.defender===game.seat?"Αμύνεσαι":game.attacker===game.seat?"Επιτίθεσαι":"Περιμένεις"}</span>
       <span>Κόζι {suitSymbol[game.trump]} · {game.stock} στην τράπουλα</span>
      </div>
      <div className="flex h-[clamp(45px,10vh,80px)] items-start justify-center overflow-visible px-2 [--card-w:clamp(3rem,9vw,6.4rem)]">
       {game.myHand.map(card=><DurakCardFace key={ident(card)} card={card}
         className={playable(card).length?"hover:-translate-y-2":"opacity-60"}
         onClick={!loading&&playable(card).length?()=>clickCard(card):undefined}/>)}
      </div>
      <div className="absolute bottom-[clamp(49px,11vh,84px)] left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-lg bg-black/75 px-2 py-1">
       {actions.filter(x=>!("card" in x)).map((move,i)=><button key={move.type+i} disabled={loading} type="button" onClick={()=>void send(move)}
        className="rounded-lg border border-amber-400 bg-[#112c20] px-3 py-1.5 text-xs font-semibold sm:text-sm">
        {move.type==="take"?"Παίρνω":move.type==="pass"?"Δεν προσθέτω":"Τέλος"}
       </button>)}
       {game.ended&&<span className="font-semibold">{game.fool===game.seat?"Έμεινες Ντουράκ":game.fool===null?"Ισοπαλία":"Η παρτίδα ολοκληρώθηκε"}</span>}
       {target!==null&&<span className="text-xs text-amber-200">Άμυνα στο φύλλο #{target+1}</span>}
      </div>
    </div>
   </DurakTableSurface>
  </div>
  {error&&<div role="alert" className="absolute left-2 top-12 z-30 max-w-xs rounded bg-red-950 p-2 text-xs">{error}</div>}
 </div>;
}
