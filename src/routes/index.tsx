import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RotateCw, Spade, Club, Play, X, Crown } from "lucide-react";
import { RefreshButton } from "@/components/joker/RefreshButton";
import { FullscreenButton } from "@/components/joker/FullscreenButton";
import { PlayerSessionGate } from "@/components/joker/PlayerSessionGate";
import { useGlobalActiveGame } from "@/hooks/useGlobalActiveGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Επιλέξτε το παιχνίδι | Joker Club" },
      { name: "description", content: "Ιδιωτικά παιχνίδια καρτών με φίλους." },
    ],
  }),
  component: GameSelection,
});

function GameSelection() {
  const globalActive = useGlobalActiveGame();
  const [leaving, setLeaving] = useState(false);

  const handleLeave = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await globalActive.leave();
    } finally {
      setLeaving(false);
    }
  };

  const active = globalActive.active;
  const inJoker = active?.game === "joker";
  const inDurak = active?.game === "durak";
  const inBiriba = active?.game === "biriba";
  const jokerHref = inJoker && active ? active.returnUrl : "/joker";

  return (
    <div className="home-landscape game-selection-screen">
      <div className="home-topbar">
        <div className="flex items-center gap-2.5">
          <div className="home-wordmark text-[#e8ce96] tracking-widest font-extrabold text-sm sm:text-base">
            JOKER CLUB
          </div>
          <span className="hidden sm:inline-block rounded-full border border-[rgba(212,175,55,0.35)] bg-[rgba(212,175,55,0.08)] px-2 py-0.5 text-[0.65rem] font-semibold text-[#f6e27a] tracking-wide uppercase">
            Private Club
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FullscreenButton />
          <RefreshButton />
        </div>
      </div>

      <main className="home-landscape__content">
        <PlayerSessionGate
          allowLogout={!active}
          onAuthenticated={() => {
            void globalActive.refresh();
          }}
          hideConnectedBanner
        >
          {(player) => (
            <div className="game-selection-container">
              <header className="game-selection-heading flex items-center justify-between px-1">
                <div className="hidden sm:block w-20" />
                <h1>Επιλέξτε το παιχνίδι</h1>
                <div className="text-right text-[0.72rem] text-[rgba(245,234,213,0.7)] truncate max-w-[14rem]">
                  <span className="hidden sm:inline">Συνδεδεμένος: </span>
                  <strong className="text-[#f6e27a] font-semibold">{player.displayName}</strong>
                </div>
              </header>

              {active && (
                <div className="home-active-banner" role="region" aria-label="Ενεργό παιχνίδι">
                  <div className="home-active-banner__info">
                    <span className="home-active-banner__pulse" aria-hidden="true" />
                    <div className="home-active-banner__title">
                      Ενεργή παρτίδα: <strong>{active.gameTitle}</strong>
                      <span className="opacity-75 text-xs ml-1.5 font-mono">#{active.roomCode}</span>
                      <span className="ml-2 text-xs text-[#cb9b51] hidden sm:inline">
                        ({active.lifecycle === "playing" ? "Σε εξέλιξη" : "Αναμονή παικτών"})
                      </span>
                    </div>
                  </div>
                  <div className="home-active-banner__actions">
                    <a
                      href={active.returnUrl}
                      className="home-active-btn home-active-btn--return"
                      aria-label={`Επιστροφή στο ${active.gameTitle}`}
                    >
                      <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                      <span>Επιστροφή στο παιχνίδι</span>
                    </a>
                    <button
                      type="button"
                      className="home-active-btn home-active-btn--leave"
                      disabled={leaving}
                      onClick={() => void handleLeave()}
                      aria-label="Έξοδος από το παιχνίδι"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{leaving ? "Έξοδος…" : "Έξοδος"}</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="game-selection-grid">
                {/* 01 JOKER — href="/joker" */}
                <a
                  href={jokerHref}
                  className={`home-choice-card ${inJoker ? "home-choice-card--active" : ""}`}
                  aria-label="Joker — είσοδος στο παιχνίδι"
                >
                  <div className="home-choice-card__top">
                    <span className="home-choice-card__number">01</span>
                    <span className="home-choice-card__icon" aria-hidden="true">
                      <Crown className="h-5 w-5 text-[#f6e27a]" />
                    </span>
                  </div>
                  <div className="home-choice-card__body">
                    <strong>JOKER</strong>
                    <small>3-6 παίκτες · Κλασικό &amp; Prive</small>
                  </div>
                  <div className="home-choice-card__footer">
                    <span className="home-choice-card__tag">
                      {inJoker ? "Ενεργή παρτίδα" : "Επίσημο"}
                    </span>
                    <span className="home-choice-card__action">
                      {inJoker ? "Επιστροφή →" : "Είσοδος →"}
                    </span>
                  </div>
                </a>

                {/* 02 DURAK */}
                <a
                  href="/durak"
                  className={`home-choice-card ${inDurak ? "home-choice-card--active" : ""}`}
                  aria-label="Durak — είσοδος στο παιχνίδι"
                >
                  <div className="home-choice-card__top">
                    <span className="home-choice-card__number">02</span>
                    <span className="home-choice-card__icon" aria-hidden="true">
                      <Spade className="h-5 w-5 text-[#f6e27a]" />
                    </span>
                  </div>
                  <div className="home-choice-card__body">
                    <strong>DURAK</strong>
                    <small>2-6 παίκτες · Ρωσικό κλασικό</small>
                  </div>
                  <div className="home-choice-card__footer">
                    <span className="home-choice-card__tag">
                      {inDurak ? "Ενεργή παρτίδα" : "Διαθέσιμο"}
                    </span>
                    <span className="home-choice-card__action">
                      {inDurak ? "Επιστροφή →" : "Είσοδος →"}
                    </span>
                  </div>
                </a>

                {/* 03 ΜΠΙΡΙΜΠΑ */}
                <a
                  href="/biriba"
                  className={`home-choice-card ${inBiriba ? "home-choice-card--active" : ""}`}
                  aria-label="Μπιρίμπα — είσοδος στο παιχνίδι"
                >
                  <div className="home-choice-card__top">
                    <span className="home-choice-card__number">03</span>
                    <span className="home-choice-card__icon" aria-hidden="true">
                      <Club className="h-5 w-5 text-[#f6e27a]" />
                    </span>
                  </div>
                  <div className="home-choice-card__body">
                    <strong>ΜΠΙΡΙΜΠΑ</strong>
                    <small>2 ή 4 παίκτες · Συνθέσεις &amp; Μπαλαντέρ</small>
                  </div>
                  <div className="home-choice-card__footer">
                    <span className="home-choice-card__tag">
                      {inBiriba ? "Ενεργή παρτίδα" : "PixiJS Realtime"}
                    </span>
                    <span className="home-choice-card__action">
                      {inBiriba ? "Επιστροφή →" : "Είσοδος →"}
                    </span>
                  </div>
                </a>
              </div>
            </div>
          )}
        </PlayerSessionGate>
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
