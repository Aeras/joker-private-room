import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { jButton } from "@/components/joker/JButton";
import { ScreenShell, SectionLabel } from "@/components/joker/ScreenShell";
import type { GameHistoryResult } from "@/server/gamePersistence";
import { getCompletedGameHistory } from "@/services/gameHistoryFunctions";

export const Route = createFileRoute("/history")({
  ssr: false,
  head: () => ({ meta: [{ title: "Ιστορικό — JOKER" }, { name: "description", content: "Ιδιωτικό ιστορικό ολοκληρωμένων παρτίδων JOKER." }] }),
  component: HistoryPage,
});

type SuccessHistory = Extract<GameHistoryResult, { ok: true }>;

function HistoryPage() {
  const [result, setResult] = useState<SuccessHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCompletedGameHistory({ data: { limit: 50 } })
      .then((response) => {
        if (!response.ok) {
          setError(response.code === "NOT_AUTHENTICATED" ? "Χρειάζεται ενεργή συνεδρία παίκτη." : "Το ιστορικό δεν είναι διαθέσιμο αυτή τη στιγμή.");
          return;
        }
        setResult(response);
      })
      .catch(() => setError("Το ιστορικό δεν είναι διαθέσιμο αυτή τη στιγμή."));
  }, []);

  return (
    <ScreenShell title="Ιστορικό">
      <Link to="/" className={jButton({ variant: "ghost", size: "sm", className: "mb-5" })}>← Αρχική</Link>
      {error && <p className="rounded-xl border border-negative/30 bg-negative/10 p-3 text-sm text-negative">{error}</p>}
      {!result && !error && <p className="text-sm text-muted-foreground">Φόρτωση…</p>}

      {result && (
        <>
          <SectionLabel>Στατιστικά</SectionLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Παρτίδες", result.stats.totalGames],
              ["1η θέση", result.stats.firstPlaceCount],
              ["2η θέση", result.stats.secondPlaceCount],
              ["3η θέση", result.stats.thirdPlaceCount],
              ["4η θέση", result.stats.fourthPlaceCount],
            ].map(([label, value]) => (
              <div key={String(label)} className="panel p-3 text-center">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-1 font-display text-xl text-primary tabular-nums">{value}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Ποσοστό νικών: — (δεν έχει ακόμη οριστεί αν η ισόβαθμη 1η θέση μετρά στον αριθμητή).</p>

          <div className="mt-7">
            <SectionLabel>Ολοκληρωμένες παρτίδες</SectionLabel>
            {result.history.length === 0 ? (
              <div className="panel p-4 text-sm text-muted-foreground">Δεν υπάρχουν ακόμη ολοκληρωμένες παρτίδες.</div>
            ) : (
              <div className="space-y-3">
                {result.history.map((game) => (
                  <article key={game.gameId} className="panel p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{new Date(game.completedAt).toLocaleString("el-GR")}</span>
                      <span>{game.rulesVersion}</span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {[...game.participants]
                        .sort((a, b) => a.finalPlacement - b.finalPlacement || b.finalScore - a.finalScore)
                        .map((participant) => (
                          <div key={participant.seatIndex} className="flex items-center justify-between rounded-xl bg-secondary/70 px-3 py-2 text-sm">
                            <span>
                              {participant.finalPlacement}η · {participant.ownerType === "human" ? participant.playerDisplayName : participant.botDisplayName}
                            </span>
                            <strong className="tabular-nums">{participant.finalScore}</strong>
                          </div>
                        ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </ScreenShell>
  );
}
