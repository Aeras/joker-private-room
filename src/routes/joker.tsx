import { createFileRoute, Link } from "@tanstack/react-router";
import { History, RotateCw, Settings2 } from "lucide-react";
import { RefreshButton } from "@/components/joker/RefreshButton";
import { FullscreenButton } from "@/components/joker/FullscreenButton";
import { JButton, jButton } from "@/components/joker/JButton";
import { t } from "@/i18n/el";
import { useCurrentActiveGame } from "@/hooks/useCurrentActiveGame";
import { BotLabEntry } from "@/components/joker/BotLabEntry";
import { PlayerSessionGate } from "@/components/joker/PlayerSessionGate";

export const Route = createFileRoute("/joker")({
  head: () => ({
    meta: [
      { title: "JOKER — Ιδιωτικό παιχνίδι" },
      { name: "description", content: "Ιδιωτικό παιχνίδι Joker για τέσσερις παίκτες." },
      { property: "og:title", content: "JOKER — Ιδιωτικό παιχνίδι" },
      { property: "og:description", content: "Ιδιωτικό παιχνίδι Joker για τέσσερις παίκτες." },
    ],
  }),
  component: JokerHome,
});

function JokerHome() {
  const activeLookup = useCurrentActiveGame();

  return (
    <div className="home-landscape">
      <div className="home-topbar">
        <Link to="/" className="home-wordmark" aria-label="Επιλογή παιχνιδιού">JOKER</Link>
        <div className="flex items-center gap-2"><FullscreenButton /><RefreshButton /></div>
      </div>

      <main className="home-landscape__content">
        <section className="home-hero" aria-label="JOKER">
          <div className="home-card-mark home-card-mark--left" aria-hidden="true">J</div>
          <div className="home-card-mark home-card-mark--right" aria-hidden="true">★</div>
          <p className="home-kicker">Ιδιωτικό παιχνίδι καρτών</p>
          <h1>JOKER</h1>
          <p className="home-subtitle">4 παίκτες · φίλοι ή bots · ένα τραπέζι</p>
        </section>

        <section className="home-menu" aria-label="Κύριο μενού">
          <PlayerSessionGate allowLogout={activeLookup.status !== "active" && activeLookup.status !== "waiting"} onAuthenticated={() => { void activeLookup.refresh(); }}>{() => <>
          {activeLookup.status === "waiting" ? (
            <Link to="/lobby" search={{ code: activeLookup.roomCode }} className={jButton({ size: "lg", className: "pregame-primary-button home-main-action" })}>
              Επιστροφή στο παιχνίδι
            </Link>
          ) : activeLookup.status === "active" ? (
            <Link
              to="/table"
              search={{ code: activeLookup.activeGame.roomCode, gameId: activeLookup.activeGame.gameId }}
              className={jButton({ size: "lg", className: "pregame-primary-button home-main-action" })}
            >
              Επιστροφή στο παιχνίδι
            </Link>
          ) : activeLookup.status === "error" ? (
            <JButton className="pregame-primary-button home-main-action" onClick={() => void activeLookup.refresh()}>
              Δοκιμή ξανά
            </JButton>
          ) : (
            <div className="home-main-actions">
              <Link to="/create" className="home-choice-card">
                <span className="home-choice-card__number">01</span>
                <strong>{t.createGame}</strong>
                <small>Φτιάξε ιδιωτικό δωμάτιο</small>
              </Link>
              <Link to="/join" search={{ code: undefined }} className="home-choice-card">
                <span className="home-choice-card__number">02</span>
                <strong>{t.joinGame}</strong>
                <small>Δες τα διαθέσιμα παιχνίδια</small>
              </Link>
            </div>
          )}

          {activeLookup.status !== "waiting" && activeLookup.status !== "active" && <div className="home-secondary-actions">
            <BotLabEntry />
            <Link to="/history"><History className="h-4 w-4" />Ιστορικό</Link>
            <Link to="/settings"><Settings2 className="h-4 w-4" />Ρυθμίσεις</Link>
          </div>}
          </>}</PlayerSessionGate>
        </section>
      </main>

      <div className="pregame-portrait-gate" role="status" aria-live="polite">
        <RefreshButton className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(.55rem,env(safe-area-inset-top))]" />
        <RotateCw className="h-10 w-10" />
        <strong>Γύρισε τη συσκευή οριζόντια</strong>
        <span>Πάτησε Full screen και συνέχισε σε landscape.</span>
        <FullscreenButton className="mt-2" />
      </div>
    </div>
  );
}
