import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { JButton } from "@/components/joker/JButton";
import { ScreenShell, SectionLabel } from "@/components/joker/ScreenShell";
import { DEMO_PLAYERS, mockIdentityService } from "@/demo/mockIdentity";
import { mockRoomService } from "@/demo/mockRooms";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/join")({
  validateSearch: (s: Record<string, unknown>) => ({ code: typeof s.code === "string" ? s.code : undefined }),
  head: () => ({
    meta: [
      { title: "Συμμετοχή σε παιχνίδι — JOKER" },
      { name: "description", content: "Μπες σε ιδιωτικό δωμάτιο JOKER με κωδικό." },
      { property: "og:title", content: "Συμμετοχή σε παιχνίδι — JOKER" },
      { property: "og:description", content: "Μπες σε ιδιωτικό δωμάτιο JOKER με κωδικό." },
    ],
  }),
  component: JoinGame,
});

const inputCls =
  "h-12 w-full rounded-xl border border-input bg-secondary px-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function JoinGame() {
  const { code: initialCode } = Route.useSearch();
  const navigate = useNavigate();
  const [code, setCode] = useState(initialCode ?? "");
  const [playerId, setPlayerId] = useState(DEMO_PLAYERS[1].id);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    // DEMO: mock verification. Production verifies the PIN server-side.
    const session = await mockIdentityService.verifyPin(playerId, pin);
    if (!session || code.trim().length !== 4) return setError(true);
    await mockRoomService.joinRoom(code, session.player);
    navigate({ to: "/lobby" });
  };

  return (
    <ScreenShell title={t.joinGame}>
      <form onSubmit={submit} className="space-y-6">
        <div>
          <SectionLabel>{t.roomCode}</SectionLabel>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="J7K4"
            autoCapitalize="characters"
            className={cn(inputCls, "text-center font-display text-2xl tracking-[0.4em]")}
          />
        </div>
        <div>
          <SectionLabel>{t.playerName}</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_PLAYERS.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setPlayerId(p.id)}
                className={cn(
                  "h-12 rounded-xl border text-sm transition-colors",
                  playerId === p.id ? "border-primary bg-gold-soft text-primary" : "border-border bg-secondary text-foreground",
                )}
              >
                {p.displayName}
              </button>
            ))}
          </div>
        </div>
        <div>
          <SectionLabel>{t.pin}</SectionLabel>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            type="password"
            autoComplete="off"
            placeholder="••••"
            className={cn(inputCls, "text-center text-2xl tracking-[0.5em]")}
          />
          <p className="mt-2 text-xs text-muted-foreground">{t.demoMode}: οποιοδήποτε PIN 4 ψηφίων.</p>
        </div>
        {error && <p className="text-sm text-negative">{t.invalidJoin}</p>}
        <JButton type="submit" size="lg" className="w-full">
          {t.enterGame}
        </JButton>
      </form>
    </ScreenShell>
  );
}
