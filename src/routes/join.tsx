import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { JButton } from "@/components/joker/JButton";
import { PlayerSessionGate } from "@/components/joker/PlayerSessionGate";
import { ScreenShell } from "@/components/joker/ScreenShell";
import { useCurrentActiveGame } from "@/hooks/useCurrentActiveGame";
import { roomFailureMessage } from "@/lib/room-feedback";
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
    <ScreenShell title="Συμμετοχή σε παιχνίδι" variant="pregame" contentClassName="pregame-centered-content">
      <PlayerSessionGate onAuthenticated={() => { void activeLookup.refresh(); }}>
        {() => <AvailableRooms activeLookup={activeLookup} />}
      </PlayerSessionGate>
    </ScreenShell>
  );
}

function AvailableRooms({ activeLookup }: { activeLookup: ReturnType<typeof useCurrentActiveGame> }) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<WaitingRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (activeLookup.status !== "none") return;
    let mounted = true;
    const update = async () => {
      try {
        const result = await listWaitingRooms();
        if (!mounted) return;
        if (result.ok) {
          setRooms(result.rooms);
          setError(null);
        } else {
          setError("Δεν ήταν δυνατή η φόρτωση των δωματίων.");
        }
      } catch {
        if (mounted) setError("Δεν ήταν δυνατή η φόρτωση των δωματίων.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void update();
    const interval = window.setInterval(() => void update(), 2500);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [activeLookup.status]);

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
      <div className="panel mx-auto max-w-lg space-y-3 p-4 text-center">
        <p>Δεν ήταν δυνατός ο έλεγχος της συμμετοχής σου.</p>
        <JButton onClick={() => void activeLookup.refresh()}>Δοκιμή ξανά</JButton>
      </div>
    );
  }
  return (
    <div className="panel mx-auto w-full max-w-2xl space-y-3 p-4">
      <h2 className="text-xl font-semibold">Διαθέσιμα παιχνίδια</h2>
      {loading && <p role="status">Φόρτωση δωματίων…</p>}
      {!loading && rooms.length === 0 && !error && (
        <p>Δεν υπάρχουν διαθέσιμα παιχνίδια αυτή τη στιγμή.</p>
      )}
      {rooms.map((room) => (
        <div key={room.code} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <div>
            <strong>Παιχνίδι του {room.hostName}</strong>
            <p className="text-sm text-muted-foreground">
              {room.rulesetId} · {room.occupied}/4 θέσεις
            </p>
          </div>
          <JButton disabled={busy} onClick={() => void join(room.code)}>Συμμετοχή</JButton>
        </div>
      ))}
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      <JButton variant="outlineGold" onClick={() => void navigate({ to: "/" })}>
        Αρχική οθόνη
      </JButton>
    </div>
  );
}
