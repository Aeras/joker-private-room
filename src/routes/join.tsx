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
import { joinProductionRoom } from "@/services/roomFunctions";

export const Route = createFileRoute("/join")({
  validateSearch: (s: Record<string, unknown>) => ({ code: typeof s["code"] === "string" ? s["code"] : undefined }),
  head: () => ({ meta: [{ title: "Συμμετοχή σε παιχνίδι — JOKER" }, { name: "description", content: "Μπες σε ιδιωτικό δωμάτιο JOKER με κωδικό." }] }),
  component: JoinGame,
});

const inputCls = "h-12 w-full rounded-xl border border-input bg-secondary px-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function JoinGame() {
  const { code: initialCode } = Route.useSearch();
  const navigate = useNavigate();
  const activeLookup = useCurrentActiveGame();
  const [code, setCode] = useState(initialCode ?? "");
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const joinActionId = useRef<string | null>(null);

  useEffect(() => {
    realIdentityService.listPlayers().then((list) => {
      const joinable = list.filter((p) => p.role !== "host");
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!playerId || code.trim().length !== 4 || pin.length !== 4 || authBusy) { setError(t.invalidJoin); return; }

    setAuthBusy(true);
    try {
      const auth = await realIdentityService.verifyPin(playerId, pin);
      if (!auth.ok) { setError(authFailureMessage(auth)); return; }

      const current = await activeLookup.refresh();
      if (current.ok && current.activeGame) {
        void navigate({ to: "/table", search: { code: current.activeGame.roomCode, gameId: current.activeGame.gameId } });
        return;
      }
      if (!current.ok && current.code === "SERVICE_UNAVAILABLE") {
        setError("Δεν ήταν δυνατός ο έλεγχος ενεργού παιχνιδιού. Δοκίμασε ξανά.");
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
    } finally { setAuthBusy(false); }
  };

  if (activeLookup.status === "loading" || activeLookup.status === "active") {
    return <div className="surface-room min-h-dvh" />;
  }

  if (activeLookup.status === "error") {
    return (
      <ScreenShell title={t.joinGame}>
        <div className="panel space-y-3 p-4">
          <p className="text-sm text-negative">Δεν ήταν δυνατός ο έλεγχος ενεργού παιχνιδιού.</p>
          <JButton className="w-full" onClick={() => void activeLookup.refresh()}>Δοκιμή ξανά</JButton>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={t.joinGame}>
      <form onSubmit={submit} className="space-y-6">
        <div><SectionLabel>{t.roomCode}</SectionLabel><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))} placeholder="J7K4" autoCapitalize="characters" className={cn(inputCls, "text-center font-display text-2xl tracking-[0.4em]")} /></div>
        <div><SectionLabel>{t.playerName}</SectionLabel><div className="grid grid-cols-2 gap-2">{players.map((p) => <button type="button" key={p.id} onClick={() => { setPlayerId(p.id); joinActionId.current = null; }} className={cn("h-12 rounded-xl border text-sm transition-colors", playerId === p.id ? "border-primary bg-gold-soft text-primary" : "border-border bg-secondary text-foreground")}>{p.displayName}</button>)}</div></div>
        <div><SectionLabel>{t.pin}</SectionLabel><input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" type="password" autoComplete="off" placeholder="••••" className={cn(inputCls, "text-center text-2xl tracking-[0.5em]")} /></div>
        {error && <p className="text-sm text-negative">{error}</p>}
        <JButton type="submit" size="lg" className="w-full" disabled={loading || authBusy}>{t.enterGame}</JButton>
      </form>
    </ScreenShell>
  );
}
