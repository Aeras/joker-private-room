import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { durakRoomCommand, type DurakRoomView, type DurakWaitingRoom } from "@/services/durakRoomFunctions";
import { PlayerSessionGate } from "@/components/joker/PlayerSessionGate";
import { ScreenShell } from "@/components/joker/ScreenShell";
import { PLAYER_COUNTS, VARIANT_NAMES, type DurakVariant } from "@/durak/rules";
import { DurakOnlineTable } from "@/durak/DurakOnlineTable";
import type { PublicPlayer } from "@/domain/players";
import { DurakWaitingSeats } from "@/durak/DurakWaitingSeats";
import { durakLobbyText, durakTableText } from "@/i18n/durak.el";

const VARIANT_DESCRIPTIONS: Record<DurakVariant, { sub: string; desc: string }> = {
  podkidnoy: {
    sub: "Подкидной",
    desc: "Ο επιτιθέμενος ρίχνει, οι υπόλοιποι παίκτες προσθέτουν φύλλα ίδιας αξίας.",
  },
  perevodnoy: {
    sub: "Переводной",
    desc: "Ο αμυνόμενος μπορεί να μεταβιβάσει την άμυνα ρίχνοντας φύλλο ίδιου βαθμού.",
  },
};

const PLAYER_COUNT_LABELS: Record<number, string> = {
  2: "Duel",
  3: "Trio",
  4: "Classic",
  5: "Table",
  6: "Full",
};

export const Route = createFileRoute("/durak")({
  head: () => ({ meta: [{ title: "DURAK — Επιλογή παιχνιδιού" }] }),
  component: DurakHome,
});

function DurakMemberAutoResume({ onMembership }: { onMembership: (code: string | null) => void }) {
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const membership = await durakRoomCommand({data:{action:"membership"}});
        if (!active || !membership.ok || !("membership" in membership)) return;
        onMembership(membership.membership?.code ?? null);
        if (!membership.membership) return;
      } catch { /* Keep manual return option available. */ }
    })();
    return () => { active=false; };
  }, [onMembership]);
  return null;
}

function DurakHome() {
  // Keep the authenticated gate mounted across lobby/table transitions without duplicate top banner.
  return <PlayerSessionGate allowLogout={false} hideConnectedBanner={true}>
    {(player) => <DurakAuthenticatedHome player={player} />}
  </PlayerSessionGate>;
}

function DurakAuthenticatedHome({ player }: { player: PublicPlayer }) {
  const [variant, setVariant] = useState<DurakVariant>("podkidnoy");
  const [playerCount, setPlayerCount] = useState<number>(4);
  const [mode, setMode] = useState<"create"|"join">("create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [room, setRoom] = useState<DurakRoomView | null>(null);
  const [available, setAvailable] = useState<DurakWaitingRoom[]>([]);
  const [membershipCode, setMembershipCode] = useState<string | null>(null);
  const [loadingMembership, setLoadingMembership] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  const [refreshingList, setRefreshingList] = useState(false);
  const setMembership = useCallback((code: string | null) => { setMembershipCode(code); }, []);
  const waitingRoomCode = room?.code;
  const waitingRoomLifecycle = room?.lifecycle;

  async function refreshList() {
    setRefreshingList(true);
    try {
      await run("list");
    } finally {
      setTimeout(() => setRefreshingList(false), 400);
    }
  }
  useEffect(() => {
    if (!waitingRoomCode || waitingRoomLifecycle !== "waiting") return;
    let active = true;
    const poll = async () => {
      try {
        const response = await durakRoomCommand({data:{action:"get",code:waitingRoomCode}});
        if(active && response.ok && "room" in response)setRoom(current=>current?.code===response.room.code && current.version>response.room.version ? current : response.room);
      }catch{/* Reconnect on next poll. */}
    };
    const timer = setInterval(()=>void poll(),600);
    return ()=>{active=false;clearInterval(timer);};
  },[waitingRoomCode,waitingRoomLifecycle]);
  async function gameAction(action:"bot_add"|"bot_remove"|"start",code:string,seat?:number,botId?:string){
    setBusy(true);setError("");
    try{
      const result=action==="bot_remove"
        ? await durakRoomCommand({data:{action:"bot_remove",code,seat:seat??0}})
        : action==="bot_add"
          ? await durakRoomCommand({data:{action:"bot_add",code,seat,botId}})
          : await durakRoomCommand({data:{action:"start",code}});
      if(!result.ok){setError(result.code);return;}
      await run("get",code);
    }catch{setError("Αδυναμία επικοινωνίας με τον διακομιστή.");}
    finally{setBusy(false);}
  }
  async function returnToGame() {
    if (!membershipCode) return;
    setLoadingMembership(true);
    await run("get", membershipCode);
    setLoadingMembership(false);
  }
  const errorMessages: Record<string,string> = {
    ACTIVE_GAME_EXISTS: "Συμμετέχεις ήδη σε άλλο δωμάτιο ή ενεργή παρτίδα. Ολοκλήρωσε ή αποχώρησε πρώτα από εκεί.",
    NOT_AUTHENTICATED: "Η σύνδεσή σου έληξε. Συνδέσου ξανά.",
    ROOM_NOT_FOUND: "Το δωμάτιο δεν βρέθηκε ή έχει κλείσει.",
    ROOM_FULL: "Το δωμάτιο είναι γεμάτο.",
    ROOM_ALREADY_STARTED: "Η παρτίδα έχει ήδη ξεκινήσει.",
    NOT_A_MEMBER: "Δεν συμμετέχεις σε αυτό το δωμάτιο.",
    SERVICE_UNAVAILABLE: "Το DURAK δεν είναι προσωρινά διαθέσιμο. Δοκίμασε ξανά.",
    ROOM_NOT_FULL:"Συμπλήρωσε τις κενές θέσεις με παίκτες ή bots.",
    BOT_UNAVAILABLE:"Το bot βρίσκεται ήδη σε άλλη θέση. Επίλεξε άλλο.",
    INVALID_BOT:"Η επιλογή bot δεν είναι διαθέσιμη.",
    HOST_ONLY:"Μόνο ο δημιουργός μπορεί να κάνει αυτή την ενέργεια.",
  };
  async function run(action: "create" | "list" | "join" | "get" | "leave", code?: string) {
    setBusy(true); setError("");
    try {
      const result = action === "create"
        ? await durakRoomCommand({data:{action,variant,capacity:playerCount}})
        : action === "list" ? await durakRoomCommand({data:{action}})
        : action === "join" ? await durakRoomCommand({data:{action,code:code ?? ""}})
        : action === "get" ? await durakRoomCommand({data:{action,code:code ?? ""}})
        : await durakRoomCommand({data:{action:"leave",code:code ?? ""}});
      if (!result.ok) { setError(result.code); return; }
      if ("room" in result) { setRoom(result.room); setMembership(result.room.code); }
      else if ("rooms" in result) { setAvailable(result.rooms); setListLoaded(true); }
      else if ("cancelled" in result) { setRoom(null); setMembership(null); }
    } catch { setError("Αδυναμία επικοινωνίας με τον διακομιστή."); }
    finally { setBusy(false); }
  }
  async function endGame(code:string) {
    const result=await durakRoomCommand({data:{action:"end_game",code}});
    if(!result.ok||!("cancelled" in result)||!result.cancelled)throw new Error("DURAK_END_FAILED");
    setRoom(null);setMembership(null);
  }
  async function newGame() {
    if (!room) return;
    const result = await durakRoomCommand({data:{action:"create",variant:room.variant,capacity:room.capacity}});
    if (!result.ok || !("room" in result)) {
      throw new Error(!result.ok ? errorMessages[result.code] ?? durakTableText.newGameFailed : durakTableText.newGameFailed);
    }
    setVariant(result.room.variant);setPlayerCount(result.room.capacity);
    setError("");setMode("create");setMembership(result.room.code);setRoom(result.room);
  }
  // The active table must not inherit the lobby header's higher stacking context.
  if (room && (room.lifecycle === "playing" || room.lifecycle === "finished")) {
    return <DurakOnlineTable code={room.code} seats={room.seats}
        onBack={(reason)=>{setRoom(null);if(reason==="closed"||reason==="finished")setMembership(null);}}
        onNewGame={newGame}
        onEndGame={room.hostPlayerId===player.id?()=>endGame(room.code):undefined}/>;
  }
  return (
    <ScreenShell
      title="DURAK"
      variant="pregame"
      fixedViewport={true}
      backTo="/"
      contentClassName="!overflow-y-auto !min-h-0 !py-0 flex flex-col justify-center"
    >
      <div className="mx-auto w-full max-w-4xl">
        <section
          className="rounded-2xl border border-primary/35 bg-black/60 backdrop-blur-md p-2.5 sm:p-3 shadow-[0_12px_45px_rgba(0,0,0,0.85)] space-y-2"
          aria-label="DURAK"
        >
          <DurakMemberAutoResume onMembership={setMembership} />

          {/* Top Switcher (Δημιουργία / Συμμετοχή) */}
          <div className="flex items-center justify-between gap-3 border-b border-primary/20 pb-1.5">
            <div className="flex items-center gap-1.5 bg-black/50 p-1 rounded-xl border border-primary/25 w-full sm:w-80 shadow-inner">
              <button
                type="button"
                aria-pressed={mode === "create"}
                onClick={() => setMode("create")}
                className={`flex-1 py-1 rounded-lg text-xs sm:text-sm font-semibold tracking-wide transition-all ${
                  mode === "create"
                    ? "bg-gradient-to-r from-[#ffe599] via-[#d4af37] to-[#9a6f1a] text-[#1a050a] font-bold shadow-[0_2px_10px_rgba(212,175,55,0.35)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                Δημιουργία
              </button>
              <button
                type="button"
                aria-pressed={mode === "join"}
                onClick={() => {
                  setMode("join");
                  if (!listLoaded) void run("list");
                }}
                className={`flex-1 py-1 rounded-lg text-xs sm:text-sm font-semibold tracking-wide transition-all ${
                  mode === "join"
                    ? "bg-gradient-to-r from-[#ffe599] via-[#d4af37] to-[#9a6f1a] text-[#1a050a] font-bold shadow-[0_2px_10px_rgba(212,175,55,0.35)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                Συμμετοχή
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 text-xs text-primary font-medium tracking-wider">
              <span>♦</span>
              <span className="uppercase font-display tracking-widest text-[11px]">Private Club Room</span>
              <span>♦</span>
            </div>
          </div>

          {membershipCode && !room && (
            <button
              type="button"
              disabled={busy || loadingMembership}
              onClick={() => void returnToGame()}
              className="w-full rounded-xl border border-primary bg-primary/20 p-2.5 font-semibold text-primary-foreground hover:bg-primary/30 transition shadow-sm"
            >
              Επιστροφή στο παιχνίδι μου
            </button>
          )}

          {error && (
            <p role="alert" className="text-xs text-negative font-medium">
              {errorMessages[error] ?? "Η ενέργεια δεν ολοκληρώθηκε. Δοκίμασε ξανά."}
            </p>
          )}

          {room ? (
            <div className="space-y-2 rounded-2xl border border-primary/35 bg-black/60 backdrop-blur-md p-2.5 sm:p-3 shadow-inner" aria-label="Δωμάτιο DURAK">
              <div className="flex items-center justify-between border-b border-primary/20 pb-1">
                <div>
                  <h2 className="font-display font-bold text-foreground text-xs sm:text-sm">Δωμάτιο DURAK</h2>
                  <p className="text-[10px] text-muted-foreground">{VARIANT_NAMES[room.variant]} · {room.capacity} παίκτες</p>
                </div>
                <span className="text-[11px] font-mono font-bold text-primary px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/30">
                  #{room.code}
                </span>
              </div>
              <DurakWaitingSeats
                seats={room.seats}
                host={room.hostPlayerId === player.id && room.lifecycle === "waiting"}
                busy={busy}
                onSelect={(seat, botId) => gameAction("bot_add", room.code, seat, botId)}
                onRemove={(seat) => gameAction("bot_remove", room.code, seat)}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/30">
                <div className="flex items-center gap-2">
                  {room.lifecycle === "waiting" && room.hostPlayerId === player.id && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void gameAction("start", room.code)}
                      className="rounded-xl bg-gradient-to-r from-[#ffe599] via-[#d4af37] to-[#9a6f1a] text-[#1a050a] px-3.5 py-1.5 text-xs font-display font-black uppercase tracking-wider hover:brightness-105 active:scale-95 transition shadow-md"
                    >
                      Έναρξη παρτίδας
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run("get",room.code)}
                    className="rounded-xl border border-border/80 bg-black/40 hover:bg-black/60 px-2.5 py-1.5 text-xs font-medium text-foreground transition"
                  >
                    Ανανέωση
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run("leave",room.code)}
                    className="rounded-xl border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 px-2.5 py-1.5 text-xs font-medium text-destructive-foreground transition"
                  >
                    Έξοδος
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground hidden sm:block truncate max-w-sm">{durakLobbyText.help}</p>
              </div>
            </div>
          ) : mode === "create" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-stretch">
              {/* Left Column: Variant Selection (Interactive Cards) */}
              <div className="flex flex-col justify-between space-y-1.5">
                <label className="text-xs font-display font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <span>♠</span> Παραλλαγή Παιχνιδιού
                </label>

                <div className="flex flex-col gap-2">
                  {Object.entries(VARIANT_NAMES).map(([id, label]) => {
                    const active = variant === id;
                    const meta = VARIANT_DESCRIPTIONS[id as DurakVariant];
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setVariant(id as DurakVariant)}
                        className={`text-left p-2.5 rounded-xl border transition-all ${
                          active
                            ? "border-primary bg-gradient-to-r from-primary/25 to-primary/10 shadow-[0_0_15px_rgba(212,175,55,0.25)] ring-1 ring-primary"
                            : "border-border/60 bg-black/40 hover:border-primary/50 opacity-75 hover:opacity-100"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-display font-bold text-foreground">
                            {label}
                          </span>
                          {active && (
                            <span className="text-[10px] font-bold text-primary bg-primary/20 border border-primary/40 px-2 py-0.5 rounded-full">
                              Επιλεγμένο
                            </span>
                          )}
                        </div>
                        {meta && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                            {meta.desc}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Player Count Chips + Big 3D Gold Action Button */}
              <div className="flex flex-col justify-between space-y-2.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-display font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                      <span>♦</span> Αριθμός Παικτών
                    </label>
                    <span className="text-xs font-bold text-foreground">
                      {playerCount} παίκτες ({PLAYER_COUNT_LABELS[playerCount] ?? "Custom"})
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                    {PLAYER_COUNTS.map((count) => {
                      const active = playerCount === count;
                      return (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setPlayerCount(count)}
                          className={`py-1.5 sm:py-2 rounded-xl border text-center transition-all ${
                            active
                              ? "border-primary bg-gradient-to-b from-primary/30 to-primary/10 shadow-[0_0_14px_rgba(212,175,55,0.35)] ring-1 ring-primary text-primary"
                              : "border-border/60 bg-black/40 hover:border-primary/40 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <div className="text-sm font-bold font-display">{count}</div>
                          <div className="text-[9px] uppercase tracking-wider opacity-75">
                            {PLAYER_COUNT_LABELS[count]}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1 pt-0.5">
                  <button
                    type="button"
                    disabled={busy || Boolean(membershipCode)}
                    onClick={() => void run("create")}
                    className="w-full py-2.5 sm:py-3 rounded-xl font-display font-bold text-xs sm:text-sm tracking-[0.15em] uppercase text-[#1a050a] bg-gradient-to-b from-[#ffe599] via-[#d4af37] to-[#8c6416] hover:brightness-105 active:scale-[0.99] transition shadow-[0_4px_20px_rgba(212,175,55,0.4)] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {busy ? "Παρακαλώ περίμενε…" : "Δημιουργία παιχνιδιού"}
                  </button>
                  {membershipCode && (
                    <p className="text-[10px] text-center text-muted-foreground">
                      Έχεις ήδη ενεργό δωμάτιο. Επίλεξε «Επιστροφή στο παιχνίδι μου».
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-display font-bold text-primary">Διαθέσιμα παιχνίδια DURAK</h2>
                <button
                  type="button"
                  disabled={busy || refreshingList}
                  onClick={() => void refreshList()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-primary/35 bg-black/40 hover:bg-black/60 hover:border-primary px-3 py-1.5 text-xs font-semibold text-primary transition active:scale-95 disabled:opacity-60"
                >
                  <RotateCw className={`h-3.5 w-3.5 ${refreshingList ? "animate-spin text-primary" : "text-primary/70"}`} />
                  <span>{refreshingList ? "Ανανέωση…" : "Ανανέωση λίστας"}</span>
                </button>
              </div>

              {listLoaded && available.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground border border-border/40 rounded-xl bg-black/30">
                  Δεν εμφανίζονται διαθέσιμα δωμάτια DURAK.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {available.map((item) => (
                  <div
                    key={item.code}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-black/40 p-3 hover:border-primary/40 transition"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-foreground truncate">{item.hostName}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {VARIANT_NAMES[item.variant]} · {item.occupied}/{item.capacity} παίκτες
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run("join",item.code)}
                      className="rounded-lg bg-gradient-to-r from-primary to-primary/80 text-primary-foreground px-3 py-1.5 text-xs font-bold hover:brightness-110 active:scale-95 transition shrink-0"
                    >
                      Συμμετοχή
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </ScreenShell>
  );
}
