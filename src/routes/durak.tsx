import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { durakRoomCommand, type DurakRoomView, type DurakWaitingRoom } from "@/services/durakRoomFunctions";
import { PlayerSessionGate } from "@/components/joker/PlayerSessionGate";
import { ScreenShell } from "@/components/joker/ScreenShell";
import { PLAYER_COUNTS, VARIANT_NAMES, type DurakVariant } from "@/durak/rules";
import { DurakOnlineTable } from "@/durak/DurakOnlineTable";

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
  const setMembership = useCallback((code: string | null) => { setMembershipCode(code); }, []);
  useEffect(() => {
    if (!room || room.lifecycle !== "waiting") return;
    let active = true;
    const poll = async () => {
      try {
        const response = await durakRoomCommand({data:{action:"get",code:room.code}});
        if(active && response.ok && "room" in response)setRoom(response.room);
      }catch{/* Reconnect on next poll. */}
    };
    const timer = setInterval(()=>void poll(),1800);
    return ()=>{active=false;clearInterval(timer);};
  },[room?.code,room?.lifecycle]);
  async function gameAction(action:"bot_add"|"bot_remove"|"start",code:string,seat?:number){
    setBusy(true);setError("");
    try{
      const data=action==="bot_remove"?{action,code,seat:seat??0}:{action,code};
      const result=await durakRoomCommand({data});
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
  return (
    <ScreenShell title="DURAK" variant="pregame" contentClassName="!overflow-y-auto !min-h-0 pb-8">
      <div className="mx-auto w-full max-w-2xl space-y-3">
        <PlayerSessionGate allowLogout={false}>
          {(player) => <section className="panel space-y-3 p-3 sm:p-4" aria-label="DURAK">
            <DurakMemberAutoResume onMembership={setMembership} />

            <div className="grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={mode === "create"} onClick={() => setMode("create")} className={`rounded-lg border p-3 font-semibold ${mode === "create" ? "border-primary bg-secondary" : "border-border"}`}>Δημιουργία</button>
              <button type="button" aria-pressed={mode === "join"} onClick={() => { setMode("join"); if (!listLoaded) void run("list"); }} className={`rounded-lg border p-3 font-semibold ${mode === "join" ? "border-primary bg-secondary" : "border-border"}`}>Συμμετοχή</button>
            </div>
            {membershipCode && !room && (
              <button type="button" disabled={busy || loadingMembership} onClick={() => void returnToGame()}
                className="w-full rounded-lg border border-primary bg-primary/15 p-3 font-semibold">
                Επιστροφή στο παιχνίδι μου
              </button>
            )}
            {error && <p role="alert" className="text-sm text-negative">{errorMessages[error] ?? "Η ενέργεια δεν ολοκληρώθηκε. Δοκίμασε ξανά."}</p>}
            {room ? <div className="space-y-3 rounded-lg border border-primary p-3" aria-label="Δωμάτιο DURAK"><h2 className="font-semibold">Δωμάτιο DURAK</h2><p className="text-sm">{VARIANT_NAMES[room.variant]} · {room.capacity} παίκτες</p><div className="grid grid-cols-3 gap-2">{room.seats.map(seat => <div key={seat.index} className="rounded-lg bg-secondary p-2 text-center text-sm">Θέση {seat.index + 1}<div>{seat.name ?? "Ελεύθερη"}</div></div>)}</div><div className="flex flex-wrap gap-2">
              {room.lifecycle==="waiting" && room.hostPlayerId===player.id && <>
                <button type="button" disabled={busy || !room.seats.some(s=>s.occupant==="empty")} onClick={()=>void gameAction("bot_add",room.code)} className="rounded-lg border border-primary px-3 py-2">+ Bot</button>
                {room.seats.filter(s=>s.occupant==="bot").map(s=><button type="button" key={s.index} disabled={busy} onClick={()=>void gameAction("bot_remove",room.code,s.index)} className="rounded-lg border px-3 py-2">− {s.name}</button>)}
                <button type="button" disabled={busy || room.seats.some(s=>s.occupant==="empty")} onClick={()=>void gameAction("start",room.code)} className="rounded-lg border border-primary bg-primary/20 px-4 py-2 font-bold">Έναρξη παρτίδας</button>
              </>}
              <button type="button" disabled={busy} onClick={() => void run("get",room.code)} className="rounded-lg border p-2">Ανανέωση</button><button type="button" disabled={busy} onClick={() => void run("leave",room.code)} className="rounded-lg border p-2">Έξοδος</button></div><p className="text-sm text-muted-foreground">Συμπλήρωσε τις θέσεις με φίλους από τη «Συμμετοχή» ή πρόσθεσε bots. Μόλις γεμίσουν οι θέσεις, ο δημιουργός ξεκινά την παρτίδα.</p></div> : mode === "create" ? <>
              <label className="block space-y-2 text-sm font-semibold">Παραλλαγή
                <select className="w-full rounded-lg border border-border bg-secondary p-3" value={variant} onChange={e => setVariant(e.target.value as DurakVariant)}>
                  {Object.entries(VARIANT_NAMES).map(([id,label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              <label className="block space-y-2 text-sm font-semibold">Αριθμός παικτών
                <select className="w-full rounded-lg border border-border bg-secondary p-3" value={playerCount} onChange={e => setPlayerCount(Number(e.target.value))}>
                  {PLAYER_COUNTS.map(count => <option key={count} value={count}>{count} παίκτες</option>)}
                </select>
              </label>
              <button type="button" disabled={busy || Boolean(membershipCode)} onClick={() => void run("create")}
                className="w-full rounded-lg border border-primary bg-primary/15 px-4 py-3 font-semibold">
                {busy ? "Παρακαλώ περίμενε…" : "Δημιουργία παιχνιδιού"}
              </button>
              {membershipCode && <p className="text-sm text-muted-foreground">Έχεις ήδη ενεργό δωμάτιο. Επίλεξε «Επιστροφή στο παιχνίδι μου».</p>}
            </> : <>
              <h2 className="font-semibold">Διαθέσιμα παιχνίδια DURAK</h2>
              <button type="button" disabled={busy} onClick={() => void run("list")} className="rounded-lg border p-2">Ανανέωση λίστας</button>
              {listLoaded && available.length === 0 && <p className="text-sm text-muted-foreground">Δεν εμφανίζονται διαθέσιμα δωμάτια DURAK.</p>}
              {available.map(item => <div key={item.code} className="flex items-center justify-between gap-2 rounded-lg border p-3"><span>{item.hostName} · {VARIANT_NAMES[item.variant]} · {item.occupied}/{item.capacity}</span><button type="button" disabled={busy} onClick={() => void run("join",item.code)} className="rounded-lg bg-secondary p-2">Συμμετοχή</button></div>)}
            </>}
          </section>}
        </PlayerSessionGate>
        {room && (room.lifecycle==="playing"||room.lifecycle==="finished") && <DurakOnlineTable code={room.code} seats={room.seats} onBack={()=>setRoom(null)}/>}
      </div>
    </ScreenShell>
  );
}
