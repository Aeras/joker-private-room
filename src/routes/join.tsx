import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { JButton } from "@/components/joker/JButton";
import { ScreenShell, SectionLabel } from "@/components/joker/ScreenShell";
import type { PublicPlayer } from "@/domain/players";
import { useCurrentActiveGame } from "@/hooks/useCurrentActiveGame";
import { t } from "@/i18n/el";
import { authFailureMessage } from "@/lib/auth-feedback";
import { roomFailureMessage } from "@/lib/room-feedback";
import { cn } from "@/lib/utils";
import { realIdentityService } from "@/services/realIdentity";
import { joinProductionRoom, listWaitingRooms, type WaitingRoomSummary } from "@/services/roomFunctions";
import { getCurrentPlayer } from "@/services/authFunctions";

export const Route = createFileRoute("/join")({
  validateSearch: (s: Record<string, unknown>) => ({ code: typeof s["code"] === "string" ? s["code"] : undefined }),
  head: () => ({ meta: [{ title: "Συμμετοχή σε παιχνίδι — JOKER" }, { name: "description", content: "Μπες σε ιδιωτικό δωμάτιο JOKER με κωδικό." }] }),
  component: JoinGame,
});

const inputCls = "h-14 w-full rounded-xl border border-input bg-secondary px-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function JoinGame() {
  const { code: initialCode } = Route.useSearch();
  const navigate = useNavigate();
  const activeLookup = useCurrentActiveGame();
  const [code, setCode] = useState(initialCode ?? "");
  const [signedIn, setSignedIn] = useState(false);
  const [available, setAvailable] = useState<WaitingRoomSummary[]>([]);
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const joinActionId = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void getCurrentPlayer().then(p => { if (mounted) setSignedIn(Boolean(p)); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!signedIn || activeLookup.status === "active") return;
    let running = true;
    const refreshRooms = async () => {
      const r = await listWaitingRooms();
      if (running) {
        if (r.ok) setAvailable(r.rooms);
        else setError("Αδυναμία φόρτωσης διαθέσιμων παιχνιδιών.");
      }
    };
    void refreshRooms();
    const id = window.setInterval(() => void refreshRooms(), 2500);
    return () => { running = false; window.clearInterval(id); };
  }, [signedIn, activeLookup.status]);

  useEffect(() => {
    realIdentityService.listPlayers().then((list) => {
      const joinable = list;
      setPlayers(joinable);
      setPlayerId(joinable[0]?.id ?? "");
    }).catch(() => setError(t.authUnavailable)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeLookup.status !== "active") return;
    void navigate({
      to: "/table",
      search: { code: activeLookup.activeGame.roomCode, gameId: activeLookup.activeGame.gameId },
    });
  }, [activeLookup.activeGame, activeLookup.status, navigate]);

  const joinSelected = async (selectedCode: string) => {
    if (authBusy) return;
    setAuthBusy(true); setError(null);
    try {
      const current = await activeLookup.refresh();
      if (!current.ok) { setError("Δεν ήταν δυνατός ο έλεγχος ενεργής συμμετοχής."); return; }
      if (current.activeGame) {
        void navigate({ to: "/table", search: { code: current.activeGame.roomCode, gameId: current.activeGame.gameId } });
        return;
      }
      joinActionId.current = crypto.randomUUID();
      const result = await joinProductionRoom({ data: { actionId: joinActionId.current, code: selectedCode } });
      if (result.ok) { void navigate({ to: "/lobby", search: { code: result.room.code } }); return; }
      setError(roomFailureMessage(result));
    } catch { setError("Η συμμετοχή απέτυχε."); }
    finally { setAuthBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!playerId || !/^\d{4}$/.test(pin) || authBusy) { setError(t.invalidJoin); return; }

    setAuthBusy(true);
    try {
      const auth = await realIdentityService.verifyPin(playerId, pin);
      if (!auth.ok) { setError(authFailureMessage(auth)); return; }

      const current = await activeLookup.refresh();
      if (current.ok && current.activeGame) {
        void navigate({ to: "/table", search: { code: current.activeGame.roomCode, gameId: current.activeGame.gameId } });
        return;
      }
      if (!current.ok) {
        setError(current.code === "SERVICE_UNAVAILABLE"
          ? "Δεν ήταν δυνατός ο έλεγχος ενεργού παιχνιδιού. Δοκίμασε ξανά."
          : t.invalidPin);
        return;
      }

      if (code.trim().length !== 4) {
        setError("Δεν έχεις ενεργό παιχνίδι. Συμπλήρωσε τον κωδικό του δωματίου στο οποίο θέλεις να μπεις.");
        return;
      }

      joinActionId.current ??= crypto.randomUUID();
      const result = await joinProductionRoom({ data: { actionId: joinActionId.current, code: code.trim().toUpperCase() } });
      if (!result.ok) {
        if (result.code === "ACTIVE_GAME_EXISTS" && result.activeGame?.roomCode) {
          joinActionId.current = null;
          navigate({ to: "/lobby", search: { code: result.activeGame.roomCode } });
          return;
        }
        if (result.code !== "SERVICE_UNAVAILABLE") joinActionId.current = null;
        setError(roomFailureMessage(result));
        return;
      }

      joinActionId.current = null;
      navigate({ to: "/lobby", search: { code: result.room.code } });
    } catch {
      setError(t.authUnavailable);
    } finally {
      setAuthBusy(false);
    }
  };

  if (activeLookup.status === "loading" || activeLookup.status === "active") {
    return <div className="surface-room min-h-dvh" />;
  }

  if (activeLookup.status === "error") {
    return (
      <ScreenShell title={t.joinGame} variant="pregame" contentClassName="pregame-centered-content">
        <div className="panel max-w-xl space-y-3 p-4">
          <p className="text-sm text-negative">Δεν ήταν δυνατός ο έλεγχος ενεργού παιχνιδιού.</p>
          <JButton className="pregame-primary-button w-full" onClick={() => void activeLookup.refresh()}>Δοκιμή ξανά</JButton>
        </div>
      </ScreenShell>
    );
  }

  if (signedIn) return (
    <ScreenShell title="Συμμετοχή σε παιχνίδι" variant="pregame" contentClassName="pregame-centered-content">
      <div className="panel w-full max-w-2xl space-y-3 p-4">
        <h2 className="text-xl font-semibold">Διαθέσιμα παιχνίδια</h2>
        {available.length === 0 && <p role="status">Δεν υπάρχουν διαθέσιμα παιχνίδια αυτή τη στιγμή.</p>}
        {available.map(room => <div key={room.code} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <div><strong>Παιχνίδι του {room.hostName}</strong>
            <p className="text-sm text-muted-foreground">{room.rulesetId} · {room.occupied}/4 θέσεις</p>
          </div>
          <JButton disabled={authBusy} onClick={() => void joinSelected(room.code)}>Συμμετοχή</JButton>
        </div>)}
        {error && <p role="alert" className="text-negative">{error}</p>}
        <JButton variant="outlineGold" onClick={() => void navigate({ to: "/" })}>Αρχική οθόνη</JButton>
      </div>
    </ScreenShell>
  );

  return (
    <ScreenShell title={t.joinGame} variant="pregame" contentClassName="pregame-centered-content">
      <form onSubmit={submit} className="pregame-join-card">
        <p className="col-span-full text-sm text-muted-foreground">Για επιστροφή στο ενεργό παιχνίδι σου, επίλεξε όνομα και βάλε το PIN σου. Κωδικός χρειάζεται μόνο για συμμετοχή σε νέο δωμάτιο.</p>
        <div>
          <SectionLabel>{t.roomCode} (προαιρετικό)</SectionLabel>
          <input disabled={authBusy} aria-label={t.roomCode} value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4)); joinActionId.current = null; }} placeholder="J7K4" autoCapitalize="characters" className={cn(inputCls, "text-center font-display text-2xl tracking-[0.4em]")} />
        </div>

        <div className="pregame-player-picker">
          <SectionLabel>{t.playerName}</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {players.map((p) => (
              <button type="button" disabled={authBusy} key={p.id} onClick={() => { setPlayerId(p.id); joinActionId.current = null; }} className={cn("h-12 rounded-xl border px-3 text-sm transition-all active:scale-[0.98]", playerId === p.id ? "border-primary bg-gold-soft text-primary" : "border-border bg-secondary text-foreground")}>
                {p.displayName}
              </button>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>{t.pin}</SectionLabel>
          <input disabled={authBusy} aria-label={t.pin} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" type="password" autoComplete="off" placeholder="••••" className={cn(inputCls, "text-center text-2xl tracking-[0.5em]")} />
        </div>

        <div className="flex items-end">
          <JButton type="submit" size="lg" className="pregame-primary-button h-14 w-full" disabled={loading || authBusy}>{t.enterGame}</JButton>
        </div>

        {error && <p className="col-span-full text-center text-sm text-negative">{error}</p>}
      </form>
    </ScreenShell>
  );
}

