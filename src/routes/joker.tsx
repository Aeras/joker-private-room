import { createFileRoute, Link } from "@tanstack/react-router";
import { History, RotateCw, Settings2 } from "lucide-react";
import { RefreshButton } from "@/components/joker/RefreshButton";
import { FullscreenButton } from "@/components/joker/FullscreenButton";
import { JButton, jButton } from "@/components/joker/JButton";
import { t } from "@/i18n/el";
import { useCurrentActiveGame } from "@/hooks/useCurrentActiveGame";
import { BotLabEntry } from "@/components/joker/BotLabEntry";
import { PlayerSessionGate } from "@/components/joker/PlayerSessionGate";
import { logoutPlayer } from "@/services/authFunctions";

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
        <Link to="/" className="home-wordmark flex items-center gap-2" aria-label="Επιλογή παιχνιδιού">
          <span className="w-7 h-7 rounded-lg bg-[#f5c15d]/20 border border-[#f5c15d]/40 flex items-center justify-center text-[#f5c15d] font-bold text-xs">J</span>
          <span>JOKER</span>
        </Link>
        <div className="flex items-center gap-2"><FullscreenButton /><RefreshButton /></div>
      </div>

      <main className="home-landscape__content">
        <section className="home-hero flex flex-col justify-center items-start text-left bg-[#1a1b1f] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden space-y-2.5" aria-label="JOKER">
          <div className="home-card-mark home-card-mark--left" aria-hidden="true">J</div>
          <div className="home-card-mark home-card-mark--right" aria-hidden="true">★</div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#f5c15d] px-2.5 py-1 rounded-full bg-[#f5c15d]/10 border border-[#f5c15d]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f5c15d]" />
            Ιδιωτικό παιχνίδι καρτών
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">JOKER</h1>
          <p className="home-subtitle text-xs text-stone-300 leading-snug">
            4 παίκτες · Φίλοι ή bots · Ένα ιδιωτικό online τραπέζι.
          </p>
          <div className="flex items-center gap-2 pt-1 z-10 relative">
            <span className="px-2.5 py-1 rounded-xl bg-[#292a2f] text-[11px] font-medium text-stone-300 border border-white/5">♠ 4 Παίκτες</span>
            <span className="px-2.5 py-1 rounded-xl bg-[#292a2f] text-[11px] font-medium text-stone-300 border border-white/5">★ 3 Παραλλαγές</span>
          </div>
        </section>

        <section className="home-menu flex flex-col justify-center space-y-2.5" aria-label="Κύριο μενού">
          <PlayerSessionGate
            allowLogout={activeLookup.status !== "active" && activeLookup.status !== "waiting"}
            hideConnectedBanner={true}
            onAuthenticated={() => { void activeLookup.refresh(); }}
          >{(player) => <>
          <div className="flex items-center justify-end gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1e2024] px-3 py-1 font-medium text-stone-300 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="max-w-[10rem] truncate">{player.displayName}</span>
            </span>
            {activeLookup.status !== "active" && activeLookup.status !== "waiting" && (
              <button
                className="text-xs text-stone-400 underline hover:text-white transition ml-1"
                type="button"
                onClick={() => void logoutPlayer()}
              >
                Αποσύνδεση
              </button>
            )}
          </div>

          {activeLookup.status === "waiting" ? (
            <Link to="/lobby" search={{ code: activeLookup.roomCode }} className={jButton({ size: "lg", className: "pregame-primary-button home-main-action rounded-2xl shadow-lg w-full" })}>
              Επιστροφή στο παιχνίδι
            </Link>
          ) : activeLookup.status === "active" ? (
            <Link
              to="/table"
              search={{ code: activeLookup.activeGame.roomCode, gameId: activeLookup.activeGame.gameId }}
              className={jButton({ size: "lg", className: "pregame-primary-button home-main-action rounded-2xl shadow-lg w-full" })}
            >
              Επιστροφή στο παιχνίδι
            </Link>
          ) : activeLookup.status === "error" ? (
            <JButton className="pregame-primary-button home-main-action rounded-2xl w-full" onClick={() => void activeLookup.refresh()}>
              Δοκιμή ξανά
            </JButton>
          ) : (
            <div className="home-main-actions grid grid-cols-2 gap-3">
              <Link to="/create" className="home-choice-card group p-3.5 sm:p-4 rounded-3xl bg-gradient-to-br from-[#292a2f] to-[#1f2024] border border-white/10 hover:border-[#f5c15d]/70 transition-all shadow-lg flex flex-col justify-between" style={{ minHeight: "110px" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-xl bg-[#f5c15d] text-[#1a1202] flex items-center justify-center font-black text-sm shadow group-hover:scale-105 transition-transform">
                    +
                  </div>
                  <span className="home-choice-card__number !static text-[10px] font-mono font-bold text-[#f5c15d] bg-[#f5c15d]/15 px-2 py-0.5 rounded-full border border-[#f5c15d]/30">01</span>
                </div>
                <div>
                  <strong className="block text-sm sm:text-base font-bold text-white group-hover:text-[#f5c15d] transition-colors">{t.createGame}</strong>
                  <small className="block text-xs text-stone-400 mt-0.5">Φτιάξε ιδιωτικό δωμάτιο</small>
                </div>
              </Link>
              <Link to="/join" search={{ code: undefined }} className="home-choice-card group p-3.5 sm:p-4 rounded-3xl bg-[#1f2024] border border-white/10 hover:border-[#f5c15d]/70 transition-all shadow-lg flex flex-col justify-between" style={{ minHeight: "110px" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-xl bg-[#34353a] text-white flex items-center justify-center font-black text-sm shadow group-hover:scale-105 transition-transform">
                    →
                  </div>
                  <span className="home-choice-card__number !static text-[10px] font-mono font-bold text-stone-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">02</span>
                </div>
                <div>
                  <strong className="block text-sm sm:text-base font-bold text-stone-200 group-hover:text-[#f5c15d] transition-colors">{t.joinGame}</strong>
                  <small className="block text-xs text-stone-400 mt-0.5">Δες τα διαθέσιμα παιχνίδια</small>
                </div>
              </Link>
            </div>
          )}

          {activeLookup.status !== "waiting" && activeLookup.status !== "active" && (
            <div className="home-secondary-actions flex items-center gap-2 pt-1">
              <BotLabEntry />
              <Link to="/history" className="flex-1 py-1.5 px-3 rounded-2xl bg-[#292a2f] hover:bg-[#34353a] border border-white/10 text-xs font-semibold text-stone-300 flex items-center justify-center gap-1.5 transition">
                <History className="h-4 w-4 text-[#f5c15d]" />
                <span>Ιστορικό</span>
              </Link>
              <Link to="/settings" className="flex-1 py-1.5 px-3 rounded-2xl bg-[#292a2f] hover:bg-[#34353a] border border-white/10 text-xs font-semibold text-stone-300 flex items-center justify-center gap-1.5 transition">
                <Settings2 className="h-4 w-4 text-[#f5c15d]" />
                <span>Ρυθμίσεις</span>
              </Link>
            </div>
          )}
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
