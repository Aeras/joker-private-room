import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PlayerSessionGate } from "@/components/joker/PlayerSessionGate";
import { FullscreenButton } from "@/components/joker/FullscreenButton";
import { RefreshButton } from "@/components/joker/RefreshButton";
import { ScreenShell } from "@/components/joker/ScreenShell";
import { PLAYER_COUNTS, VARIANT_NAMES, type DurakVariant } from "@/durak/rules";

export const Route = createFileRoute("/durak")({
  head: () => ({ meta: [{ title: "DURAK — Επιλογή παιχνιδιού" }] }),
  component: DurakHome,
});

function DurakHome() {
  const [variant, setVariant] = useState<DurakVariant>("podkidnoy");
  const [playerCount, setPlayerCount] = useState<number>(4);
  const [mode, setMode] = useState<"create"|"join">("create");
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
              <button type="button" aria-pressed={mode === "create"} onClick={() => setMode("create")} className={`rounded-lg border p-3 font-semibold ${mode === "create" ? "border-primary bg-secondary" : "border-border"}`}>Δημιουργία</button>
              <button type="button" aria-pressed={mode === "join"} onClick={() => setMode("join")} className={`rounded-lg border p-3 font-semibold ${mode === "join" ? "border-primary bg-secondary" : "border-border"}`}>Συμμετοχή</button>
            </div>
            {mode === "create" ? <>
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
              <button type="button" disabled className="w-full cursor-not-allowed rounded-lg bg-secondary p-3 font-semibold opacity-60">Δημιουργία δωματίου — σε υλοποίηση</button>
            </> : <>
              <h2 className="font-semibold">Διαθέσιμα παιχνίδια DURAK</h2>
              <p className="text-sm text-muted-foreground">Η ξεχωριστή λίστα online δωματίων DURAK δεν έχει ενεργοποιηθεί ακόμη. Δεν εμφανίζουμε δωμάτια JOKER.</p>
            </>}
          </section>}
        </PlayerSessionGate>
      </div>
    </ScreenShell>
  );
}
