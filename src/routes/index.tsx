import { createFileRoute, Link } from "@tanstack/react-router";
import { History, Settings } from "lucide-react";
import { jButton } from "@/components/joker/JButton";
import { t } from "@/i18n/el";
import { SUIT_SYMBOL } from "@/domain/cards";

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

function Home() {
  return (
    <div className="surface-room relative flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex gap-1">
        <Link
          to="/history"
          aria-label="Ιστορικό"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <History className="h-5 w-5" />
        </Link>
        <Link
          to="/settings"
          aria-label={t.settings}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </div>

      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="mb-6 flex gap-3 text-2xl text-primary/70">
          <span>{SUIT_SYMBOL.spades}</span>
          <span className="text-card-red">{SUIT_SYMBOL.hearts}</span>
          <span className="text-card-red">{SUIT_SYMBOL.diamonds}</span>
          <span>{SUIT_SYMBOL.clubs}</span>
        </div>
        <h1 className="font-display text-7xl font-semibold tracking-[0.15em] text-primary sm:text-8xl">{t.appName}</h1>
        <div className="my-4 h-px w-24 bg-gradient-to-r from-transparent via-primary to-transparent" />
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">{t.subtitle}</p>

        <div className="mt-12 flex w-full flex-col gap-3">
          <Link to="/create" className={jButton({ size: "lg" })}>
            {t.createGame}
          </Link>
          <Link to="/join" search={{ code: undefined }} className={jButton({ variant: "secondary", size: "lg" })}>
            {t.joinGame}
          </Link>
        </div>
      </div>
    </div>
  );
}
