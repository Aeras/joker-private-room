import "./durakFullscreen.css";
import { DurakFullscreenHand } from "./DurakFullscreenHand";
import { CANONICAL_BOTS } from "../../supabase/functions/_shared/bot-catalog";
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
  const avatarFor = (index: number, name: string) => {
    const knownBot = CANONICAL_BOTS.find(
      (bot) => bot.displayName.toLowerCase() === name.trim().toLowerCase(),
    );
    if (seats.find((seat) => seat.index === index)?.occupant === "bot") {
      return (knownBot ?? CANONICAL_BOTS[index % CANONICAL_BOTS.length])?.avatarUrl;
    }
    return assets.avatar("", name) ?? knownBot?.avatarUrl;
  };
  const pairColumns = Math.max(1, Math.min(game.pairs.length > 12 ? 6 : game.pairs.length > 6 ? 4 : 3, game.pairs.length));
  return (
    <div className="durak-fullscreen" data-player-count={n} aria-label="Online τραπέζι DURAK">
      <header className="durak-fullscreen-header">
        <span className="min-w-0 truncate font-bold">
          DURAK · {VARIANT_NAMES[game.variant]} · Γύρος {game.round}
        </span>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => void fetchState()}>
            Ανανέωση
          </button>
          <button type="button" onClick={onBack}>
            Πίσω
          </button>
        </div>
      </header>
      <div className="durak-fullscreen-field">
        <DurakTableSurface>
          {others.map((other) => (
            <div
              key={other.index}
              data-durak-opponent-seat={other.index}
              data-position={positions[other.relative] ?? "top"}
              className="durak-fullscreen-opponent"
            >
              <div
                className={`rounded-full border border-primary/70 bg-black/75 p-[3px] shadow-xl ${game.defender === other.index || game.attacker === other.index ? "ring-2 ring-primary/75" : ""}`}
              >
                <PlayerAvatar
                  name={other.name}
                  isBot={seats.find((s) => s.index === other.index)?.occupant === "bot"}
                  imageUrl={assets.tableAvatar(avatarFor(other.index, other.name))}
                  fallbackImageUrl={avatarFor(other.index, other.name)}
                  size="sm"
                  className="durak-fullscreen-avatar border-0"
                />
              </div>
              <div className="durak-fullscreen-opponent-info">
                <span className="block truncate" title={other.name}>
                  {other.name}
                </span>
                <span className="text-amber-200">
                  {game.defender === other.index
                    ? "Άμυνα"
                    : game.attacker === other.index
                      ? "Επίθεση"
                      : ""}{" "}
                  {other.size} φύλλα
                </span>
              </div>
              <div className="durak-fullscreen-opponent-backs">
                {Array.from({ length: Math.min(other.size, 7) }, (_, i) => (
                  <DurakCardBack key={i} />
                ))}
              </div>
            </div>
          ))}
          <div className="durak-fullscreen-center" data-durak-center>
            <div className="durak-fullscreen-stock">
              <DurakStock trump={game.trumpCard} remaining={game.stock} />
            </div>
            <div
              className="durak-fullscreen-pairs"
              style={{
                gridTemplateColumns: `repeat(${pairColumns}, max-content)`,
                "--durak-pair-columns": pairColumns,
                "--durak-pair-rows": Math.max(1, Math.ceil(game.pairs.length / pairColumns)),
              } as import("react").CSSProperties}
            >
              {game.pairs.map((pair, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTarget(i)}
                  aria-pressed={target === i}
                  data-durak-pair
                  className={`durak-fullscreen-pair ${target === i ? "border-amber-300 bg-white/20" : "border-white/20 bg-black/10"}`}
                >
                  <DurakCardFace card={pair.attack} />
                  {pair.defense && (
                    <span className="durak-fullscreen-defense">
                      <DurakCardFace card={pair.defense} />
                    </span>
                  )}
                </button>
              ))}
              {game.pairs.length === 0 && (
                <span className="rounded-xl bg-black/40 px-3 py-2 text-xs">Αναμονή επίθεσης…</span>
              )}
            </div>
          </div>
        </DurakTableSurface>
      </div>
      <div className="durak-fullscreen-controls">
        <div className="durak-fullscreen-status">
          <span className="truncate font-semibold">
            {playerName(game.seat)} ·{" "}
            {game.defender === game.seat
              ? "Αμύνεσαι"
              : game.attacker === game.seat
                ? "Επιτίθεσαι"
                : "Περιμένεις"}
          </span>
          <span>
            Κόζι {suitSymbol[game.trump]} · {game.stock} στην τράπουλα
          </span>
        </div>
        <div className="durak-fullscreen-actions">
          {actions
            .filter((x) => !("card" in x))
            .map((move, i) => (
              <button
                key={move.type + i}
                disabled={loading}
                type="button"
                onClick={() => void send(move)}
              >
                {move.type === "take" ? "Παίρνω" : move.type === "pass" ? "Δεν προσθέτω" : "Τέλος"}
              </button>
            ))}
          {game.ended && (
            <span className="font-semibold">
              {game.fool === game.seat
                ? "Έμεινες Ντουράκ"
                : game.fool === null
                  ? "Ισοπαλία"
                  : "Η παρτίδα ολοκληρώθηκε"}
            </span>
          )}
          {target !== null && (
            <span className="text-xs text-amber-200">Άμυνα στο φύλλο #{target + 1}</span>
          )}
        </div>
      </div>
      <DurakFullscreenHand
        cards={game.myHand}
        busy={loading}
        canPlay={(card) => playable(card).length > 0}
        onPlay={clickCard}
      />
      {error && (
        <div
          role="alert"
          className="absolute left-2 top-12 z-30 max-w-xs rounded bg-red-950 p-2 text-xs"
        >
          {error}
        </div>
      )}
    </div>
  );
}
