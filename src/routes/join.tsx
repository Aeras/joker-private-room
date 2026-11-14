import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { JButton } from "@/components/joker/JButton";
import { PlayerSessionGate } from "@/components/joker/PlayerSessionGate";
import { ScreenShell } from "@/components/joker/ScreenShell";
import type { PublicPlayer } from "@/domain/players";
import { useCurrentActiveGame } from "@/hooks/useCurrentActiveGame";
import { roomFailureMessage } from "@/lib/room-feedback";
import { cn } from "@/lib/utils";
import {
  joinProductionRoom,
  listWaitingRooms,
  type WaitingRoomSummary,
} from "@/services/roomFunctions";

export const Route = createFileRoute("/join")({
  // Accept older invitation URLs, but never require their code.
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s["code"] === "string" ? s["code"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Διαθέσιμα παιχνίδια — JOKER" },
      { name: "description", content: "Συμμετοχή σε διαθέσιμο παιχνίδι JOKER." },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const activeLookup = useCurrentActiveGame();
  return (
    <ScreenShell title="Συμμετοχή σε παιχνίδι" variant="pregame" fixedViewport={true} contentClassName="pregame-centered-content">
      <PlayerSessionGate onAuthenticated={() => { void activeLookup.refresh(); }} hideConnectedBanner={true}>
        {(player) => <AvailableRooms player={player} activeLookup={activeLookup} />}
      </PlayerSessionGate>
    </ScreenShell>
  );
}

function AvailableRooms({ player, activeLookup }: { player: PublicPlayer; activeLookup: ReturnType<typeof useCurrentActiveGame> }) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<WaitingRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    if (activeLookup.status === "waiting") {
      void navigate({ to: "/lobby", search: { code: activeLookup.roomCode } });
    } else if (activeLookup.status === "active") {
      void navigate({
        to: "/table",
        search: { code: activeLookup.activeGame.roomCode, gameId: activeLookup.activeGame.gameId },
      });
    }
  }, [activeLookup.status, activeLookup.status === "waiting" ? activeLookup.roomCode : null,
      activeLookup.status === "active" ? activeLookup.activeGame.gameId : null, navigate]);

  const fetchRooms = useCallback(async () => {
    try {
      const result = await listWaitingRooms();
      if (result.ok) {
        setRooms(result.rooms);
        setError(null);
      } else {
        setError("Δεν ήταν δυνατή η φόρτωση των δωματίων.");
      }
    } catch {
      setError("Δεν ήταν δυνατή η φόρτωση των δωματίων.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshList = async () => {
    if (refreshing || busy) return;
    setRefreshing(true);
    const minWait = new Promise((resolve) => setTimeout(resolve, 400));
    try {
      await Promise.all([fetchRooms(), minWait]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (activeLookup.status !== "none") return;
    void fetchRooms();
    const interval = window.setInterval(() => void fetchRooms(), 3000);
    return () => { window.clearInterval(interval); };
  }, [activeLookup.status, fetchRooms]);

  async function join(code: string) {
    if (busy || activeLookup.status !== "none") return;
    setBusy(true);
    setError(null);
    try {
      pending.current ??= crypto.randomUUID();
      const result = await joinProductionRoom({ data: { code, actionId: pending.current } });
      if (result.ok) {
        pending.current = null;
        void navigate({ to: "/lobby", search: { code: result.room.code } });
      } else if (result.code === "ACTIVE_GAME_EXISTS") {
        pending.current = null;
        setError("Συμμετέχεις ήδη σε άλλο παιχνίδι.");
        await activeLookup.refresh();
      } else {
        if (result.code !== "SERVICE_UNAVAILABLE") pending.current = null;
        setError(roomFailureMessage(result));
      }
    } catch {
      setError("Δεν ήταν δυνατή η συμμετοχή. Δοκίμασε ξανά.");
    } finally {
      setBusy(false);
    }
  }

  if (activeLookup.status === "loading" || activeLookup.status === "waiting" ||
      activeLookup.status === "active") {
    return <p role="status" className="text-center">Έλεγχος συμμετοχής…</p>;
  }
  if (activeLookup.status === "error" || activeLookup.status === "unauthenticated") {
    return (
      <div className="panel mx-auto max-w-lg space-y-3 p-4 text-center rounded-2xl">
        <p>Δεν ήταν δυνατός ο έλεγχος της συμμετοχής σου.</p>
        <JButton onClick={() => void activeLookup.refresh()}>Δοκιμή ξανά</JButton>
      </div>
    );
  }
  return (
    <div className="panel mx-auto w-full max-w-2xl space-y-3 p-3 sm:p-4 rounded-3xl shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2.5">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-display font-bold text-primary">Διαθέσιμα παιχνίδια</h2>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <span>Συνδεδεμένος:</span>
            <span className="font-semibold text-foreground">{player.displayName}</span>
          </div>
        </div>
        <button
          type="button"
          disabled={busy || refreshing}
          onClick={() => void refreshList()}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-white/[0.04] hover:bg-white/[0.08] hover:border-primary px-3 py-1.5 text-xs font-semibold text-primary transition active:scale-95 disabled:opacity-60 shrink-0"
        >
          <RotateCw className={cn("h-3.5 w-3.5", refreshing ? "animate-spin text-primary" : "text-primary/70")} />
          <span>{refreshing ? "Ανανέωση…" : "Ανανέωση λίστας"}</span>
        </button>
      </div>

      {loading && <p role="status" className="text-center text-sm py-4 text-muted-foreground">Φόρτωση δωματίων…</p>}

      {!loading && rooms.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-border/60 bg-black/20 p-5 text-center text-sm text-muted-foreground">
          <p>Δεν υπάρχουν διαθέσιμα παιχνίδια αυτή τη στιγμή.</p>
        </div>
      )}

      <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
        {rooms.map((room) => (
          <div key={room.code} className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-black/30 p-2.5 sm:p-3 hover:border-primary/40 transition">
            <div className="min-w-0">
              <strong className="text-sm font-semibold text-foreground block truncate">Παιχνίδι του {room.hostName}</strong>
              <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <span className="uppercase text-[10px] tracking-wider font-semibold text-primary/80">{room.rulesetId}</span>
                <span>·</span>
                <span>{room.occupied}/4 θέσεις</span>
              </p>
            </div>
            <JButton size="sm" className="pregame-primary-button rounded-xl px-4 py-1.5 text-xs shrink-0" disabled={busy} onClick={() => void join(room.code)}>
              Συμμετοχή
            </JButton>
          </div>
        ))}
      </div>

      {error && <p role="alert" className="text-center text-xs text-negative">{error}</p>}

      <div className="flex justify-center pt-1 border-t border-border/30">
        <JButton size="sm" variant="outlineGold" className="rounded-full px-5 py-1.5 text-xs" onClick={() => void navigate({ to: "/" })}>
          Αρχική οθόνη
        </JButton>
      </div>
    </div>
  );
}
