import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { JButton } from "@/components/joker/JButton";
import { ScreenShell, SectionLabel } from "@/components/joker/ScreenShell";
import type { PublicPlayer } from "@/domain/players";
import { mockRoomService } from "@/demo/mockRooms";
import { realIdentityService } from "@/services/realIdentity";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/join")({
  validateSearch: (s: Record<string, unknown>) => ({ code: typeof s["code"] === "string" ? s["code"] : undefined }),
  head: () => ({ meta: [{ title: "Συμμετοχή σε παιχνίδι — JOKER" }, { name: "description", content: "Μπες σε ιδιωτικό δωμάτιο JOKER με κωδικό." }] }),
  component: JoinGame,
});

const inputCls = "h-12 w-full rounded-xl border border-input bg-secondary px-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function JoinGame() {
  const { code: initialCode } = Route.useSearch();
  const navigate = useNavigate();
  const [code, setCode] = useState(initialCode ?? "");
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    realIdentityService.listPlayers().then((list) => {
      const joinable = list.filter((p) => p.role !== 'host');
      setPlayers(joinable);
      setPlayerId(joinable[0]?.id ?? '');
    }).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    if (!playerId || code.trim().length !== 4) return setError(true);
    const session = await realIdentityService.verifyPin(playerId, pin);
    if (!session) return setError(true);
    await mockRoomService.joinRoom(code, session.player);
    navigate({ to: "/lobby" });
  };

  return (
    <ScreenShell title={t.joinGame}>
      <form onSubmit={submit} className="space-y-6">
        <div><SectionLabel>{t.roomCode}</SectionLabel><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))} placeholder="J7K4" autoCapitalize="characters" className={cn(inputCls, "text-center font-display text-2xl tracking-[0.4em]")} /></div>
        <div>
          <SectionLabel>{t.playerName}</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {players.map((p) => <button type="button" key={p.id} onClick={() => setPlayerId(p.id)} className={cn("h-12 rounded-xl border text-sm transition-colors", playerId === p.id ? "border-primary bg-gold-soft text-primary" : "border-border bg-secondary text-foreground")}>{p.displayName}</button>)}
          </div>
        </div>
        <div><SectionLabel>{t.pin}</SectionLabel><input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" type="password" autoComplete="off" placeholder="••••" className={cn(inputCls, "text-center text-2xl tracking-[0.5em]")} /></div>
        {error && <p className="text-sm text-negative">{t.invalidJoin}</p>}
        <JButton type="submit" size="lg" className="w-full" disabled={loading}>{t.enterGame}</JButton>
      </form>
    </ScreenShell>
  );
}
