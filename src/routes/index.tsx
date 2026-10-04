import { createFileRoute, Link } from "@tanstack/react-router";
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
}: {
  to: "/create" | "/join";
  image: string;
  label: string;
}) {
  const content = (
    <>
      <img src={image} alt="" aria-hidden="true" className="home-art-button__image" draggable={false} />
      <span className="sr-only">{label}</span>
    </>
  );

  if (to === "/join") {
    return (
      <Link to="/join" search={{ code: undefined }} aria-label={label} className="home-art-button">
        {content}
      </Link>
    );
  }

  return (
    <Link to="/create" aria-label={label} className="home-art-button">
      {content}
    </Link>
  );
}

function HomeActions() {
  return (
    <div className="home-actions">
      <HomeArtButton to="/create" image={CREATE_GAME_ART} label={t.createGame} />
      <HomeArtButton to="/join" image={JOIN_GAME_ART} label={t.joinGame} />
    </div>
  );
}

function Home() {
  const activeLookup = useCurrentActiveGame();

  return (
    <div className="home-premium">
      <img src={HOME_BACKGROUND} alt="" aria-hidden="true" className="home-premium__background" draggable={false} />

      <main className="home-premium__content">
        {activeLookup.status === "active" ? (
          <div className="home-actions home-actions--single">
            <Link
              to="/table"
              search={{ code: activeLookup.activeGame.roomCode, gameId: activeLookup.activeGame.gameId }}
              className={jButton({ size: "lg", className: "pregame-primary-button w-full text-base" })}
            >
              Επιστροφή στο παιχνίδι
            </Link>
          </div>
        ) : activeLookup.status === "error" ? (
          <div className="home-actions home-actions--single">
            <JButton className="pregame-primary-button w-full" onClick={() => void activeLookup.refresh()}>
              Δοκιμή ξανά
            </JButton>
          </div>
        ) : (
          <HomeActions />
        )}
      </main>
    </div>
  );
}
