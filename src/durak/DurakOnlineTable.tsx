import { DurakDiscardFlight } from "./DurakDiscardFlight";
import { DurakResults } from "./DurakResults";
import { DurakDiscardPile } from "./DurakDiscardPile";
import { durakTapMove, durakDropMove } from "./defenseSelection";
import { useDurakPresentation } from "./useDurakPresentation";
import { DurakPlayedCard } from "./DurakPlayedCard";
import "./durakFullscreen.css";
import { DurakTableMenu } from "./DurakTableMenu";
import { durakTableText as text } from "@/i18n/durak.el";
import { DurakFullscreenHand } from "./DurakFullscreenHand";
import { CANONICAL_BOTS } from "../../supabase/functions/_shared/bot-catalog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { assets } from "@/assets/registry";
import { PlayerAvatar } from "@/components/joker/PlayerAvatar";
import { durakRoomCommand } from "@/services/durakRoomFunctions";
import { DurakCardBack, DurakStock, DurakTableSurface } from "./DurakTableVisuals";
import { DURAK_SEAT_POSITIONS, type DurakCard } from "./rules";
import type { DurakMove } from "./engine";
const suitSymbol={clubs:"♣",diamonds:"♦",hearts:"♥",spades:"♠"};
const ident=(c:DurakCard)=>c.suit+":"+c.rank;

export function DurakOnlineTable({code,seats,onBack,onEndGame,onNewGame}:{
 code:string;seats:Array<{index:number;name:string|null;occupant:string}>;onBack:(reason?:"closed"|"finished")=>void;onEndGame?:(()=>Promise<void>)|undefined;onNewGame?:(()=>Promise<void>)|undefined;
}) {
 const { game, flight, collection, landDiscard, finishDiscard, accept: setGame, presenting } = useDurakPresentation(code);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [closed,setClosed]=useState(false);
 const [target,setTarget]=useState<number|null>(null);
 const [dragTarget,setDragTarget]=useState<number|null>(null);
 useEffect(()=>{setTarget(null);setDragTarget(null);},[game?.revision,game?.round]);
 const fetchState=useCallback(async()=>{
   try{
     const r=await durakRoomCommand({data:{action:"get_game",code}});
     if(r.ok&&"game" in r)setGame(r.game);
     else if(!r.ok&&(r.code==="ROOM_NOT_FOUND"||r.code==="NOT_STARTED")){setClosed(true);}
     else if(!r.ok&&r.code!=="STATE_CHANGED")setError("Δεν ήταν δυνατή η ενημέρωση της παρτίδας.");
   }catch{setError("Η σύνδεση διακόπηκε. Περιμένουμε επανασύνδεση.");}
 },[code,setGame]);
 useEffect(()=>{
   void fetchState();
   const id=setInterval(()=>{void fetchState();},1600);
   return ()=>clearInterval(id);
 },[fetchState]);
 const actions=useMemo(()=>game?.legalMoves??[],[game?.legalMoves]);
 const send=async(move:DurakMove)=>{
   if (loading || presenting) return;
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
   const action=durakTapMove(card,actions,game?.pairs??[],target);
   if(action)void send(action);
   else if(target!==null)setError(text.invalidDefense);
 };
 const positions=useMemo(()=>game?DURAK_SEAT_POSITIONS[game.handSizes.length]??[]:[],[game]);
 if(closed)return <div className="durak-fullscreen flex items-center justify-center gap-4"><p>{text.closed}</p><button type="button" onClick={()=>onBack("closed")}>{text.back}</button></div>;
 if(!game)return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#10261c] p-6 text-white">
   <div className="space-y-4 text-center">Φόρτωση παρτίδας DURAK…
     <div><button type="button" onClick={()=>void fetchState()} className="rounded border px-4 py-2">Επανάληψη</button></div>
     <div><button type="button" onClick={()=>onBack()} className="text-sm underline">Πίσω στο δωμάτιο</button></div>
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
  const attackSeats = game.attackSeats ?? [game.attacker];
  const roleFor = (seat: number) => game.ended ? "idle" : game.defender === seat ? "defend" : attackSeats.includes(seat) ? "attack" : "idle";
  const roleText = (seat: number) => roleFor(seat) === "defend" ? text.defense : roleFor(seat) === "attack" ? (game.pairs.length === 0 ? text.starts : text.attack) : "";
  const pairColumns = Math.max(1, Math.min(game.pairs.length > 12 ? 6 : game.pairs.length > 6 ? 4 : 3, game.pairs.length));
  return (
    <div className="durak-fullscreen" data-player-count={n} aria-label="Online τραπέζι DURAK">
      <DurakTableMenu onBack={()=>onBack(game.ended?"finished":undefined)} onRefresh={()=>void fetchState()} onEndGame={onEndGame} onError={setError}/>
      <div className="durak-fullscreen-field">
        <DurakTableSurface>
          {others.map((other) => (
            <div
              key={other.index}
              data-durak-opponent-seat={other.index}
              data-durak-role={roleFor(other.index)}
              data-position={positions[other.relative] ?? "top"}
              className="durak-fullscreen-opponent"
            >
              <div
                className="durak-opponent-ring rounded-full border border-primary/70 bg-black/75 p-[3px] shadow-xl"
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
                  {roleText(other.index)}{" "}
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
          <DurakDiscardPile count={game.discardCount}/>
          <div className="durak-turn-summary" role="status">{game.ended ? text.completed : text.roles(playerName(game.attacker), playerName(game.defender))}{flight && <span> · {text.played(playerName(flight.seat), flight.kind)}</span>}</div>
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
                  key={ident(pair.attack)}
                  type="button"
                  onClick={() => {if(game.defender === game.seat && !loading && !presenting)setTarget(current => current === i ? null : i);}}
                  aria-pressed={target === i}
                  data-durak-pair
                  data-durak-pair-index={i}
                  data-durak-drop-target={dragTarget === i || undefined}
                  className={`durak-fullscreen-pair ${target === i ? "border-amber-300 bg-white/20" : "border-white/20 bg-black/10"}`}
                >
                  <DurakPlayedCard card={pair.attack} flight={flight} localSeat={game.seat} />
                  {pair.defense && (
                    <span className="durak-fullscreen-defense">
                      <DurakPlayedCard card={pair.defense} flight={flight} localSeat={game.seat} />
                    </span>
                  )}
                </button>
              ))}
              {!game.ended && game.pairs.length === 0 && (
                <span role="status" className="durak-fullscreen-attack-prompt" data-local-turn={actions.some(move=>move.type==="attack")}>
                  {actions.some(move=>move.type==="attack") ? text.yourAttack : text.waitingAttack(playerName(game.attacker))}
                </span>
              )}
            </div>
          </div>
        </DurakTableSurface>
      </div>
      <div className="durak-fullscreen-controls">
        <div className="durak-fullscreen-status" data-durak-role={roleFor(game.seat)}>
          <span className="truncate font-semibold">
            {playerName(game.seat)} ·{" "}
            {game.ended ? text.completed : game.defender === game.seat
              ? "Αμύνεσαι"
              : attackSeats.includes(game.seat)
                ? "Επιτίθεσαι"
                : "Περιμένεις"}
          </span>
          <span>
            Ατού {suitSymbol[game.trump]} · {game.stock} στην τράπουλα
          </span>
        </div>
        <div className="durak-fullscreen-actions">
          {game.defender === game.seat && actions.some(move=>move.type==="defend") && <span className="durak-defense-help">{text.defenseHelp}</span>}
          {actions
            .filter((x) => !("card" in x))
            .map((move, i) => (
              <button
                key={move.type + i}
                disabled={loading || presenting}
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
      <DurakDiscardFlight collection={collection} onLand={landDiscard} onComplete={finishDiscard} />
      <DurakResults key={code} game={game} playerName={playerName} onNewGame={onNewGame} />
      <DurakFullscreenHand
        cards={game.myHand}
        busy={loading || presenting}
        canPlay={(card) => playable(card).length > 0}
        onPlay={clickCard}
        onDrop={game.defender === game.seat ? (card,pair)=>{const action=durakDropMove(card,actions,pair);if(action)void send(action);} : undefined}
        canDrop={(card,pair)=>Boolean(durakDropMove(card,actions,pair))}
        onDragTarget={setDragTarget}
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
