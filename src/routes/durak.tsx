import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { durakRoomCommand, type DurakRoomView, type DurakWaitingRoom } from "@/services/durakRoomFunctions";
import { PlayerSessionGate } from "@/components/joker/PlayerSessionGate";
import { FullscreenButton } from "@/components/joker/FullscreenButton";
import { RefreshButton } from "@/components/joker/RefreshButton";
import { ScreenShell } from "@/components/joker/ScreenShell";
import { PLAYER_COUNTS, VARIANT_NAMES, type DurakVariant } from "@/durak/rules";
import { createDurakLobbyPreview } from "@/durak/lobby";

export const Route = createFileRoute("/durak")({
  head: () => ({ meta: [{ title: "DURAK — Επιλογή παιχνιδιού" }] }),
  component: DurakHome,
});

function DurakHome() {
  const [variant, setVariant] = useState<DurakVariant>("podkidnoy");
  const [playerCount, setPlayerCount] = useState<number>(4);
  const [mode, setMode] = useState<"create"|"join">("create");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [room, setRoom] = useState<DurakRoomView | null>(null);
  const [available, setAvailable] = useState<DurakWaitingRoom[]>([]);
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
      if ("room" in result) setRoom(result.room);
      else if ("rooms" in result) setAvailable(result.rooms);
      else if ("cancelled" in result) { setRoom(null); await run("list"); }
    } catch { setError("Αδυναμία επικοινωνίας με τον διακομιστή."); }
    finally { setBusy(false); }
  }
  return (
    <ScreenShell title="DURAK" variant="pregame" contentClassName="pregame-centered-content">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="text-sm text-primary underline">← Επιλογή παιχνιδιού</Link>
          <div className="flex gap-2"><FullscreenButton /><RefreshButton /></div>
        </div>
        <PlayerSessionGate allowLogout={false}>
          {(player) => <section className="panel space-y-4 p-4" aria-label="DURAK">
            <p className="text-center text-sm text-muted-foreground">Παίκτης: {player.displayName}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={mode === "create"} onClick={() => { setMode("create"); setPreview(false); }} className={`rounded-lg border p-3 font-semibold ${mode === "create" ? "border-primary bg-secondary" : "border-border"}`}>Δημιουργία</button>
              <button type="button" aria-pressed={mode === "join"} onClick={() => { setMode("join"); setPreview(false); }} className={`rounded-lg border p-3 font-semibold ${mode === "join" ? "border-primary bg-secondary" : "border-border"}`}>Συμμετοχή</button>
            </div>
            {error && <p role="alert" className="text-sm text-negative">Σφάλμα: {error}</p>}
            {room ? <div className="space-y-3 rounded-lg border border-primary p-3" aria-label="Δωμάτιο DURAK"><h2 className="font-semibold">Δωμάτιο {room.code}</h2><p className="text-sm">{VARIANT_NAMES[room.variant]} · {room.capacity} παίκτες</p><div className="grid grid-cols-3 gap-2">{room.seats.map(seat => <div key={seat.index} className="rounded-lg bg-secondary p-2 text-center text-sm">Θέση {seat.index + 1}<div>{seat.name ?? "Ελεύθερη"}</div></div>)}</div><div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void run("get",room.code)} className="rounded-lg border p-2">Ανανέωση</button><button type="button" disabled={busy} onClick={() => void run("leave",room.code)} className="rounded-lg border p-2">Έξοδος</button></div><p className="text-sm text-muted-foreground">Η έναρξη παρτίδας και η επιλογή bots θα ενεργοποιηθούν σε επόμενο στάδιο.</p></div> : mode === "create" ? <>
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
              <p className="text-sm text-muted-foreground">Επιλογή: {VARIANT_NAMES[variant]} · {playerCount} θέσεις. Η δημιουργία online δωματίου θα ενεργοποιηθεί μόλις συνδεθεί ο ανεξάρτητος DURAK server.</p>
              <button type="button" onClick={() => setPreview(value => !value)} className="w-full rounded-lg border border-primary p-3 font-semibold">{preview ? "Κλείσιμο προεπισκόπησης" : "Προεπισκόπηση δωματίου"}</button>
              {preview && <div className="rounded-xl border border-border p-3 space-y-3" aria-label="Προεπισκόπηση δωματίου DURAK">
                <p className="font-semibold">Προεπισκόπηση · Δεν δημιουργήθηκε online δωμάτιο</p>
                <div className="grid grid-cols-3 gap-2">{createDurakLobbyPreview(player.displayName, variant, playerCount).seats.map(seat => <div key={seat.index} className="rounded-lg bg-secondary p-3 text-center text-sm"><span className="block font-semibold">Θέση {seat.index + 1}</span><span>{seat.name ?? "Ελεύθερη · παίκτης ή bot"}</span></div>)}</div>
              </div>}
              <button type="button" disabled={busy} onClick={() => void run("create")} className="w-full rounded-lg border border-primary p-3 font-semibold">Δημιουργία online δωματίου</button>
            </> : <>
              <h2 className="font-semibold">Διαθέσιμα παιχνίδια DURAK</h2>
              <button type="button" disabled={busy} onClick={() => void run("list")} className="rounded-lg border p-3">Ανανέωση διαθέσιμων δωματίων</button>
              {available.length === 0 && <p className="text-sm text-muted-foreground">Δεν εμφανίζονται διαθέσιμα δωμάτια DURAK.</p>}
              {available.map(item => <div key={item.code} className="flex items-center justify-between gap-2 rounded-lg border p-3"><span>{item.hostName} · {VARIANT_NAMES[item.variant]} · {item.occupied}/{item.capacity}</span><button type="button" disabled={busy} onClick={() => void run("join",item.code)} className="rounded-lg bg-secondary p-2">Συμμετοχή</button></div>)}
            </>}
          </section>}
        </PlayerSessionGate>
      </div>
    </ScreenShell>
  );
}
