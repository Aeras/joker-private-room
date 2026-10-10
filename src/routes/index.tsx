import { createFileRoute } from "@tanstack/react-router";
import { RotateCw, Spade } from "lucide-react";
import { RefreshButton } from "@/components/joker/RefreshButton";
import { FullscreenButton } from "@/components/joker/FullscreenButton";
import { PlayerSessionGate } from "@/components/joker/PlayerSessionGate";
import { useCurrentActiveGame } from "@/hooks/useCurrentActiveGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Επιλέξτε το παιχνίδι" },
      { name: "description", content: "Ιδιωτικά παιχνίδια καρτών με φίλους." },
    ],
  }),
  component: GameSelection,
});

function GameSelection() {
  const active = useCurrentActiveGame();
  const inJoker = active.status === "waiting" || active.status === "active";
  return (
    <div className="home-landscape">
      <div className="home-topbar">
        <div className="home-wordmark">ΠΑΙΧΝΙΔΙΑ</div>
        <div className="flex items-center gap-2"><FullscreenButton /><RefreshButton /></div>
      </div>
      <main className="home-landscape__content">
        <section className="home-hero" aria-label="Επιλογή παιχνιδιού">
          <div className="home-card-mark home-card-mark--left" aria-hidden="true">J</div>
          <div className="home-card-mark home-card-mark--right" aria-hidden="true">★</div>
          <p className="home-kicker">Ιδιωτικά παιχνίδια με φίλους</p>
          <h1>Επιλέξτε το παιχνίδι</h1>
        </section>
        <section className="home-menu" aria-label="Διαθέσιμα παιχνίδια">
          <PlayerSessionGate
            allowLogout={!inJoker && active.status !== "loading" && active.status !== "error"}
            onAuthenticated={() => { void active.refresh(); }}
          >
            {() => (
              <div className="home-main-actions">
                <a href="/joker" className="home-choice-card" aria-label="Joker — είσοδος στο παιχνίδι">
                  <span className="home-choice-card__number">01</span>
                  <strong>JOKER</strong>
                  <small>{inJoker ? "Επιστροφή στην παρτίδα" : "Δημιουργία ή συμμετοχή"}</small>
                </a>
                <div className="home-choice-card cursor-not-allowed opacity-60" aria-disabled="true" aria-label="Durak — προσεχώς">
                  <span className="home-choice-card__number">02</span>
                  <strong><Spade className="inline-block h-5 w-5" aria-hidden="true" /> DURAK</strong>
                  <small>Προσεχώς</small>
                </div>
                {active.status === "error" && (
                  <p role="alert" className="col-span-full text-center text-sm text-negative">
                    Δεν ήταν δυνατός ο έλεγχος ενεργής παρτίδας. Μπορείς να μπεις στο Joker για επανάληψη.
                  </p>
                )}
              </div>
            )}
          </PlayerSessionGate>
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
