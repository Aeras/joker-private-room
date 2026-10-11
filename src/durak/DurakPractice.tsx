import { useEffect, useState } from "react";
import { applyDurakMove, beginDurak, legalDurakMoves, type DurakMatch, type DurakMove } from "@/durak/engine";
import { chooseDurakBotMove } from "@/durak/bot";
import { VARIANT_NAMES, type DurakCard, type DurakVariant } from "@/durak/rules";

const names: Record<string,string>={clubs:"♣",diamonds:"♦",hearts:"♥",spades:"♠"};
const ranks: Record<number,string>={11:"J",12:"Q",13:"K",14:"A"};
function label(card:DurakCard){return (ranks[card.rank]??card.rank)+names[card.suit];}
function CardFace({card,onClick,selected}: {card:DurakCard;onClick?:()=>void;selected?:boolean}){
 return <button type="button" disabled={!onClick} onClick={onClick} className={`min-w-11 rounded-lg border px-2 py-3 text-lg font-bold shadow-sm ${card.suit==="hearts"||card.suit==="diamonds"?"text-red-600":"text-stone-900"} ${selected?"ring-2 ring-amber-400":"border-stone-400"} bg-stone-100 disabled:opacity-90`}>{label(card)}</button>;
}
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
 return <div className="rounded-xl border border-primary/50 bg-black/20 p-3 space-y-3">
  <div className="flex items-center justify-between gap-2"><h2 className="font-bold">Δοκιμαστικό DURAK · Εσύ εναντίον bot</h2><button type="button" className="rounded border p-2" onClick={onClose}>Κλείσιμο</button></div>
  <p className="text-sm">{VARIANT_NAMES[variant]} · Γύρος {match.round} · Κόζι {names[match.trump]} · Τράπουλα {match.deck.length} φύλλα</p>
  {match.ended?<p className="font-bold">{match.fool===0?"Έχασες — Ντουράκ!":match.fool===1?"Κέρδισες!":"Ισοπαλία"}</p>:<p className="text-sm">{match.defender===0?"Αμύνεσαι":"Επιτίθεσαι"} · {match.taking?"Ο αμυνόμενος παίρνει":""}</p>}
  <div className="rounded-lg bg-secondary/40 p-3">
   <div className="flex justify-between"><b>Bot</b><span>{match.hands[1]?.length} φύλλα {match.defender===1?"· Άμυνα":""}</span></div>
   <div className="flex flex-wrap gap-1 py-2">{match.hands[1]?.map((_,i)=><span key={i} className="inline-block h-11 w-7 rounded border border-amber-600 bg-amber-950 shadow-sm"/>)}</div>
  </div>
  <div className="min-h-32 rounded-lg border border-primary/25 p-3 space-y-2"><p className="text-sm">Τραπέζι — επίλεξε επιθετική κάρτα για να αμυνθείς</p>
   <div className="flex flex-wrap gap-3">{match.pairs.map((pair,i)=><button type="button" key={i} onClick={()=>setSelectedPair(i)} aria-pressed={selectedPair===i} className={`relative rounded border p-2 ${selectedPair===i?"border-primary":"border-transparent"}`}>
    <span className="text-lg font-bold">{label(pair.attack)}</span>{pair.defense&&<span className="ml-2 text-lg font-bold text-primary">↗ {label(pair.defense)}</span>}
   </button>)}</div>
  </div>
  <div className="space-y-2"><b>Τα φύλλα σου ({match.hands[0]?.length})</b>
   <div className="flex flex-wrap gap-1">{match.hands[0]?.map(card=><CardFace key={card.suit+card.rank} card={card} onClick={options(card).length?()=>cardClick(card):undefined}/>)}</div>
  </div>
  {error&&<p role="alert" className="text-red-400">{error}</p>}
  <div className="flex flex-wrap gap-2">{legal.filter(m=>!("card" in m)).map((move,i)=><button type="button" key={move.type+i} className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-2" onClick={()=>play(move)}>{{take:"Παίρνω",pass:"Δεν προσθέτω",finish:"Τέλος"}[move.type as "take"|"pass"|"finish"]}</button>)}</div>
  <p className="text-xs text-muted-foreground">Δοκιμαστική παρτίδα στον browser. Δεν δημιουργεί online δωμάτιο ούτε επηρεάζει το JOKER.</p>
 </div>;
}
