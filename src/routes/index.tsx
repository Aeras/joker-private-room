import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { RotateCw, Play, X, ChevronLeft, ChevronRight } from "lucide-react";
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

type GameCardItem = {
  id: string;
  number: string;
  title: string;
  desc: string;
  href: string;
  coverImage: string;
  badge: string;
  ctaText: string;
  ctaActive?: boolean;
  isComingSoon?: boolean;
  isActive?: boolean;
};

function GameSelection() {
  const globalActive = useGlobalActiveGame();
  const [leaving, setLeaving] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollCarousel = (direction: -1 | 1) => {
    if (!trackRef.current) return;
    const firstCard = trackRef.current.firstElementChild as HTMLElement | null;
    const cardWidth = firstCard ? firstCard.offsetWidth + 14 : 230;
    trackRef.current.scrollBy({ left: direction * cardWidth, behavior: "smooth" });
  };

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

  const games: GameCardItem[] = [
    {
      id: "joker",
      number: "01",
      title: "JOKER",
      desc: "3–6 παίκτες · Φάση 9φυλλου & Prive",
      href: jokerHref,
      coverImage: "/covers/joker_cover.webp",
      badge: inJoker ? "● Ενεργή Παρτίδα" : "★ VIP Room",
      ctaText: inJoker ? "Επιστροφή →" : "Είσοδος →",
      ctaActive: inJoker,
      isActive: inJoker,
    },
    {
      id: "durak",
      number: "02",
      title: "DURAK",
      desc: "2–6 παίκτες · Podkidnoy & Perevodnoy",
      href: "/durak",
      coverImage: "/covers/durak_cover.webp",
      badge: inDurak ? "● Ενεργή Παρτίδα" : "⚔ Κλασικό",
      ctaText: inDurak ? "Επιστροφή →" : "Είσοδος →",
      ctaActive: inDurak,
      isActive: inDurak,
    },
    {
      id: "biriba",
      number: "03",
      title: "ΜΠΙΡΙΜΠΑ",
      desc: "2 ή 4 παίκτες · Συνθέσεις & Μπαλαντέρ",
      href: "/biriba",
      coverImage: "/covers/biriba_cover.webp",
      badge: inBiriba ? "● Ενεργή Παρτίδα" : "✨ Realtime",
      ctaText: inBiriba ? "Επιστροφή →" : "Είσοδος →",
      ctaActive: inBiriba,
      isActive: inBiriba,
    },
    {
      id: "tavli",
      number: "04",
      title: "ΤΑΒΛΙ",
      desc: "Πόρτες, Πλακωτό, Φεύγα · VIP Ταμπλό",
      href: "#",
      coverImage: "/covers/tavli_cover.webp",
      badge: "🔒 Σύντομα",
      ctaText: "Προσεχώς",
      isComingSoon: true,
    },
    {
      id: "poker",
      number: "05",
      title: "ΠΟΚΕΡ",
      desc: "Texas Hold'em · Cash & Τουρνουά",
      href: "#",
      coverImage: "/covers/poker_cover.webp",
      badge: "🔒 Σύντομα",
      ctaText: "Προσεχώς",
      isComingSoon: true,
    },
  ];

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
          className="flex flex-col flex-1 min-h-0 h-full w-full"
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

              {/* Horizontal Game Poster Carousel Wrapper */}
              <div className="game-carousel-wrapper">
                <button
                  type="button"
                  className="game-carousel-btn game-carousel-btn--prev hidden sm:flex"
                  onClick={() => scrollCarousel(-1)}
                  aria-label="Προηγούμενα παιχνίδια"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <div className="game-selection-grid game-carousel-track" ref={trackRef}>
                  {games.map((g) => (
                    <a
                      key={g.id}
                      href={g.isComingSoon ? undefined : g.href}
                      onClick={g.isComingSoon ? (e) => e.preventDefault() : undefined}
                      className={`home-choice-card game-carousel-card ${g.isActive ? "home-choice-card--active game-carousel-card--active" : ""}`}
                      aria-label={`${g.title} — είσοδος στο παιχνίδι`}
                      style={{ cursor: g.isComingSoon ? "default" : "pointer" }}
                    >
                      {/* High-res illustrated cover background */}
                      <div
                        className="game-card-bg"
                        style={{ backgroundImage: `url(${g.coverImage})` }}
                      />
                      <div className="game-card-overlay" />

                      {/* Top Bar: Number & Status Badge */}
                      <div className="home-choice-card__top game-card-top">
                        <span className="home-choice-card__number game-card-number">{g.number}</span>
                        <span
                          className={`game-card-badge ${g.isComingSoon ? "game-card-badge--coming" : g.isActive ? "game-card-badge--active" : ""}`}
                        >
                          {g.badge}
                        </span>
                      </div>

                      {/* Bottom Info: Title, Description, CTA */}
                      <div className="home-choice-card__body game-card-bottom">
                        <strong className="game-card-title">{g.title}</strong>
                        <small className="game-card-desc">{g.desc}</small>
                        <div className="home-choice-card__footer game-card-cta">
                          <span className="home-choice-card__tag game-card-tag">
                            {g.isComingSoon ? "Υπό κατασκευή" : g.isActive ? "Ενεργή παρτίδα" : "Διαθέσιμο"}
                          </span>
                          <span
                            className={`home-choice-card__action game-card-action ${g.ctaActive ? "game-card-action--active" : ""}`}
                          >
                            {g.ctaText}
                          </span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>

                <button
                  type="button"
                  className="game-carousel-btn game-carousel-btn--next hidden sm:flex"
                  onClick={() => scrollCarousel(1)}
                  aria-label="Επόμενα παιχνίδια"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              {/* Default routes: href="/joker" href="/biriba" */}
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
