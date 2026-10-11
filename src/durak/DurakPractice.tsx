import { useEffect, useState } from "react";
import { applyDurakMove, beginDurak, legalDurakMoves, type DurakMatch, type DurakMove } from "@/durak/engine";
import { chooseDurakBotMove } from "@/durak/bot";
import { VARIANT_NAMES, type DurakCard, type DurakVariant } from "@/durak/rules";
import { DurakCardFace, DurakCardBack, DurakStock, DurakTableSurface } from "@/durak/DurakTableVisuals";

export function DurakPractice({variant,onClose}:{variant:DurakVariant;onClose:()=>void}){
 const [match,setMatch]=useState<DurakMatch>(()=>beginDurak(variant,2));
 const [selectedPair,setSelectedPair]=useState<number|null>(null);
 const [error,setError]=useState("");
 const legal=legalDurakMoves(match,0);
 const play=(move:DurakMove)=>{try{setMatch(m=>applyDurakMove(m,0,move));setSelectedPair(null);setError("");}catch{setError("Μη επιτρεπτή κίνηση.");}};
 useEffect(()=>{
  if(match.ended)return;
  const seat=1;
  if(!legalDurakMoves(match,seat).length)return;
  // Bots never read private cards from other players to make decisions.
  const timeout=setTimeout(()=>{
   const action=chooseDurakBotMove(match,seat,"balanced");
   if(!action)return;
   try{setMatch(m=>applyDurakMove(m,seat,action));}catch{/* stale render handled on next turn */}
  },650);
  return ()=>clearTimeout(timeout);
 },[match]);
 const options=(card:DurakCard):DurakMove[]=>legal.filter((m):m is DurakMove&{card:DurakCard}=>"card" in m&&m.card.suit===card.suit&&m.card.rank===card.rank);
 const cardClick=(card:DurakCard)=>{
  const opts=options(card);
  const defend=opts.filter(m=>m.type==="defend");
  const selected=defend.find(m=>m.type==="defend"&&m.pair===selectedPair);
  const move=selected??opts.find(m=>m.type==="transfer")??defend[0]??opts.find(m=>m.type==="attack");
  if(move)play(move);else setError("Επίλεξε επιτρεπτό φύλλο ή κάρτα προς άμυνα.");
 };
 return <div className="mx-auto w-full max-w-6xl space-y-2" aria-label="Τραπέζι DURAK">
  <div className="flex flex-wrap items-center justify-between gap-2">
    <div className="text-sm font-semibold">{VARIANT_NAMES[variant]} · Γύρος {match.round}</div>
    <button type="button" className="rounded-lg border border-primary/40 px-3 py-1.5 text-sm" onClick={onClose}>← Πίσω</button>
  </div>
  <DurakTableSurface>
    <div className="relative z-10 flex items-start justify-center pt-3 sm:pt-5">
      <div className="flex flex-col items-center gap-1 rounded-xl bg-black/40 px-4 py-2">
        <span className="text-sm font-semibold text-white">Bot {match.defender===1?"· Αμύνεται":"· Επιτίθεται"}</span>
        <div className="flex items-center -space-x-5 [--card-w:2.4rem] sm:[--card-w:3rem]">
          {match.hands[1]?.map((_,i)=><DurakCardBack key={i}/>)}
        </div>
        <span className="text-xs text-white/80">{match.hands[1]?.length} φύλλα</span>
      </div>
    </div>

    <div className="relative z-10 flex flex-1 flex-col justify-center gap-2 px-3 py-3 sm:px-6">
      <div className="flex items-center justify-between gap-2 text-sm text-white">
        <span className="rounded-lg bg-black/45 px-2 py-1">
          {match.ended?(match.fool===0?"Ντουράκ — έχασες":match.fool===1?"Κέρδισες!":"Ισοπαλία"):(match.defender===0?"Η σειρά σου: άμυνα":"Η σειρά σου: επίθεση")}
        </span>
        <span className="rounded-lg bg-black/45 px-2 py-1">Απορρίφθηκαν: {match.discard.length}</span>
      </div>
      <div className="flex min-h-28 items-center justify-center gap-2 sm:min-h-44">
        <DurakStock trump={match.trumpCard} remaining={match.deck.length}/>
        <div className="flex flex-1 flex-wrap items-center justify-center gap-2 [--card-w:2.75rem] sm:[--card-w:4rem]" aria-label="Επίθεση και άμυνα">
          {match.pairs.length===0&&<span className="rounded-full bg-black/35 px-4 py-2 text-sm text-white/80">Το τραπέζι είναι άδειο</span>}
          {match.pairs.map((pair,i)=><button key={i} type="button" aria-pressed={selectedPair===i} onClick={()=>setSelectedPair(i)}
            className={`relative flex h-24 min-w-16 items-center rounded-lg border p-1 transition-all sm:h-36 ${selectedPair===i?"border-amber-300 bg-amber-400/20":"border-white/15 bg-black/10"}`}>
            <DurakCardFace card={pair.attack}/>
            {pair.defense&&<span className="-ml-6 mt-5 rotate-12"><DurakCardFace card={pair.defense}/></span>}
          </button>)}
        </div>
      </div>
      {selectedPair!==null&&<p className="text-center text-xs text-white/80">Επιλέχθηκε επίθεση {selectedPair+1} · παίξε φύλλο άμυνας</p>}
    </div>

    <div className="relative z-10 mt-auto space-y-2 rounded-t-2xl bg-black/50 px-3 pb-3 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-white">
        <span className="text-sm font-semibold">Εσύ · {match.hands[0]?.length} φύλλα</span>
        <div className="flex flex-wrap gap-1.5">
          {legal.filter(m=>!("card" in m)).map((move,i)=><button key={move.type+i} type="button" onClick={()=>play(move)}
            className="rounded-lg border border-amber-400/60 bg-black/60 px-3 py-1.5 text-sm font-semibold text-white">
            {{take:"Παίρνω",pass:"Δεν προσθέτω",finish:"Τέλος"}[move.type as "take"|"pass"|"finish"]}
          </button>)}
        </div>
      </div>
      <div className="flex min-h-24 items-end justify-center -space-x-2 overflow-x-auto pb-1 [--card-w:3rem] sm:-space-x-3 sm:[--card-w:4.5rem]">
        {match.hands[0]?.map(card=><DurakCardFace key={card.suit+card.rank} card={card} onClick={options(card).length?()=>cardClick(card):undefined}
          className={options(card).length?"hover:-translate-y-2 focus-visible:-translate-y-2":"opacity-60"}/>)}
      </div>
    </div>
  </DurakTableSurface>
  {error&&<p role="alert" className="text-sm text-red-400">{error}</p>}
  <p className="text-xs text-muted-foreground">Τοπική δοκιμή εναντίον bot — δεν συνδέεται με online παρτίδες. Επίλεξε επιθετικό φύλλο στο τραπέζι πριν παίξεις την άμυνά σου.</p>
 </div>;
}
