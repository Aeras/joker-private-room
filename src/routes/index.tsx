import { createFileRoute, Link } from "@tanstack/react-router";
import { History, Settings } from "lucide-react";
import { JButton, jButton } from "@/components/joker/JButton";
import { t } from "@/i18n/el";
import { useCurrentActiveGame } from "@/hooks/useCurrentActiveGame";

const HOME_BACKGROUND = "/home/file_00000000ff708210a91f5598803905f3.png";
const CREATE_GAME_ART = "/home/file_0000000025f481f49e4f8c88502ea288.png";
const JOIN_GAME_ART = "/home/file_000000000c548243815079f73a1f05cb.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JOKER — Ιδιωτικό παιχνίδι" },
      { name: "description", content: "Ιδιωτικό παιχνίδι Joker για τέσσερις παίκτες." },
      { property: "og:title", content: "JOKER — Ιδιωτικό παιχνίδι" },
      { property: "og:description", content: "Ιδιωτικό παιχνίδι Joker για τέσσερις παίκτες." },
    ],
  }),
  component: Home,
});

function HomeArtButton({
  to,
  image,
  label,
  tone,
}: {
  to: "/create" | "/join";
  image: string;
  label: string;
  tone: "primary" | "secondary";
}) {
  const content = (
    <>
      <img src={image} alt="" aria-hidden="true" className="home-art-button__image" draggable={false} />
      <span className="sr-only">{label}</span>
    </>
  );
  const className = `home-art-button home-art-button--${tone} group`;

  if (to === "/join") {
    return (
      <Link to="/join" search={{ code: undefined }} aria-label={label} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <Link to="/create" aria-label={label} className={className}>
      {content}
    </Link>
  );
}

function Home() {
  const activeLookup = useCurrentActiveGame();

  return (
    <div className="home-premium relative flex min-h-dvh flex-col overflow-hidden px-5">
      <img src={HOME_BACKGROUND} alt="" aria-hidden="true" className="home-premium__background" draggable={false} />
      <div className="home-premium__veil" aria-hidden="true" />

      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 flex gap-2">
        <Link to="/history" aria-label="Ιστορικό" className="home-utility-button">
          <History className="h-5 w-5" />
        </Link>
        <Link to="/settings" aria-label={t.settings} className="home-utility-button">
          <Settings className="h-5 w-5" />
        </Link>
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-end pb-[max(2rem,env(safe-area-inset-bottom))] pt-28 text-center sm:justify-center sm:pb-8">
        <div className="home-brand mb-8">
          <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.42em] text-primary/80">Private card room</p>
          <h1 className="font-display text-6xl font-semibold tracking-[0.16em] text-[#f6e8c2] drop-shadow-[0_5px_24px_rgba(0,0,0,0.7)] sm:text-7xl">
            {t.appName}
          </h1>
          <div className="mx-auto my-4 h-px w-28 bg-gradient-to-r from-transparent via-primary/80 to-transparent" />
          <p className="text-xs uppercase tracking-[0.28em] text-[#d7c6ad]/80">{t.subtitle}</p>
        </div>

        <div className="w-full space-y-3">
          {activeLookup.status === "loading" ? (
            <div className="pregame-glass-panel p-4 text-sm text-muted-foreground">Έλεγχος ενεργού παιχνιδιού…</div>
          ) : activeLookup.status === "error" ? (
            <div className="pregame-glass-panel space-y-3 p-4">
              <p className="text-sm text-negative">Δεν ήταν δυνατός ο έλεγχος ενεργού παιχνιδιού.</p>
              <JButton className="pregame-primary-button w-full" onClick={() => void activeLookup.refresh()}>Δοκιμή ξανά</JButton>
            </div>
          ) : activeLookup.status === "active" ? (
            <Link
              to="/table"
              search={{ code: activeLookup.activeGame.roomCode, gameId: activeLookup.activeGame.gameId }}
              className={jButton({ size: "lg", className: "pregame-primary-button w-full text-base" })}
            >
              Επιστροφή στο παιχνίδι
            </Link>
          ) : (
            <div className="space-y-3">
              <HomeArtButton to="/create" image={CREATE_GAME_ART} label={t.createGame} tone="primary" />
              <HomeArtButton to="/join" image={JOIN_GAME_ART} label={t.joinGame} tone="secondary" />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
