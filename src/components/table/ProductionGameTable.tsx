import { Link } from "@tanstack/react-router";
import { Maximize, Minimize, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { assets } from "@/assets/registry";
import { JButton } from "@/components/joker/JButton";
import { PlayingCard } from "@/components/joker/PlayingCard";
import type { Room } from "@/domain/players";
import type { GameplayCommand } from "@/domain/gameplayCommands";
import type { LocalLegalAction, PlayerGameProjection } from "@/domain/projection";
import { cn } from "@/lib/utils";
import { TableSeat } from "./TableSeat";
import { AuthoritativeScoreboard } from "./AuthoritativeScoreboard";

type Pos = 0 | 1 | 2 | 3;
const TRICK_OFFSET: Record<Pos, string> = { 0: "translate-y-[38%]", 1: "-translate-x-[58%] -rotate-6", 2: "-translate-y-[38%]", 3: "translate-x-[58%] rotate-6" };
type OrientationLock = ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void> };

function actionOf<T extends LocalLegalAction["type"]>(projection: PlayerGameProjection, type: T) {
  return projection.local.legalActions.find((action) => action.type === type) as Extract<LocalLegalAction, { type: T }> | undefined;
}

function suitLabel(suit: string | null) {
  if (suit == null) return "Χωρίς ατού";
  return ({ spades: "♠ Μπαστούνια", hearts: "♥ Κούπες", diamonds: "♦ Καρά", clubs: "♣ Σπαθιά" } as Record<string, string>)[suit] ?? suit;
}

function secondsUntil(deadline: string | null): number | null {
  if (!deadline) return null;
  return Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000));
}

export function ProductionGameTable({
  room,
  projection,
  busy,
  onCommand,
  onReclaim,
}: {
  room: Room;
  projection: PlayerGameProjection;
  busy: boolean;
  onCommand: (command: GameplayCommand) => Promise<void>;
  onReclaim: () => Promise<void>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(() => secondsUntil(projection.local.humanDeadline));
  const localSeat = projection.viewerSeat;
  const seatAt = (pos: Pos) => (localSeat + pos) % 4;
  const posOf = (seat: number) => ((seat - localSeat + 4) % 4) as Pos;
  const names = useMemo(() => room.seats.map((seat) => {
    const o = seat.occupant;
    return o.type === "human" ? o.player.displayName : o.type === "bot" ? o.bot.displayName : `Θέση ${seat.index + 1}`;
  }), [room.seats]);

  useEffect(() => {
    const update = () => setPortrait(window.innerHeight > window.innerWidth);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("orientationchange", update); };
  }, []);
  useEffect(() => {
    const change = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  useEffect(() => {
    setSeconds(secondsUntil(projection.local.humanDeadline));
    if (!projection.local.humanDeadline) return;
    const id = window.setInterval(() => setSeconds(secondsUntil(projection.local.humanDeadline)), 250);
    return () => window.clearInterval(id);
  }, [projection.local.humanDeadline]);
  useEffect(() => setSelectedCardId(null), [projection.stateVersion]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await rootRef.current?.requestFullscreen();
        await (screen.orientation as OrientationLock).lock?.("landscape").catch(() => undefined);
      } else await document.exitFullscreen();
    } catch { /* OS/browser fallback only */ }
  };

  const legalPlay = actionOf(projection, "play_card");
  const legalCardIds = new Set(legalPlay?.cardIds ?? []);
  const declare = actionOf(projection, "declare");
  const chooseTrump = actionOf(projection, "choose_trump");
  const joker = actionOf(projection, "choose_joker_semantic");
  const reclaim = actionOf(projection, "reclaim_control");

  const seatBlock = (pos: Pos, orientation: "horizontal" | "vertical") => {
    const seat = seatAt(pos);
    return <TableSeat
      seat={room.seats[seat]!}
      orientation={orientation}
      local={pos === 0}
      showCards={false}
      stats={{
        totalScore: projection.score.cumulativeTotals[seat] ?? 0,
        declaration: projection.declarations.values[seat] ?? null,
        tricksTaken: projection.score.tricksTaken[seat] ?? 0,
        isDealer: projection.progression.dealerSeat === seat,
        isActive: projection.progression.currentActorSeat === seat,
        cardCount: 0,
      }}
    />;
  };

  return <div ref={rootRef} className="joker-room relative h-dvh w-full overflow-hidden bg-[#090b09]">
    {assets.tableArt && <img src={assets.tableArt} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-center select-none" />}
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/25" />

    {portrait && <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/95 px-8 text-center backdrop-blur-sm"><div className="max-w-sm rounded-3xl border border-primary/35 bg-card/95 p-6 shadow-2xl"><div className="mb-3 text-4xl">↻</div><div className="font-display text-xl text-primary">Γύρισε τη συσκευή οριζόντια</div><p className="mt-2 text-sm text-muted-foreground">Το ενεργό παιχνίδι λειτουργεί σε landscape προβολή.</p></div></div>}

    <header className="absolute inset-x-0 top-0 z-50 flex items-center gap-2 px-2 pt-2">
      <Link to="/lobby" search={{ code: room.code }} className="rounded-lg bg-black/60 px-3 py-2 text-xs text-white/80">Lobby</Link>
      <div className="rounded-lg bg-black/60 px-3 py-2 text-xs text-white/80">Γύρος {projection.progression.round} · Μοίρασμα {projection.progression.dealNumber}/24 · {projection.progression.cardsPerPlayer} φύλλα</div>
      {seconds != null && <div className="rounded-lg bg-black/70 px-3 py-2 font-display text-sm text-primary tabular-nums">{seconds}s</div>}
      <div className="ml-auto flex gap-1">
        <JButton variant="outlineGold" size="sm" onClick={() => setScoreOpen(true)}><Trophy className="h-4 w-4" /> Σκορ</JButton>
        <JButton variant="outlineGold" size="sm" onClick={toggleFullscreen}>{fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}</JButton>
      </div>
    </header>

    <main className="absolute inset-x-[5vw] top-[10vh] bottom-[27vh]">
      <div className="relative h-full w-full">
        <div className="absolute left-1/2 top-[1%] z-20 -translate-x-1/2">{seatBlock(2, "horizontal")}</div>
        <div className="absolute left-[2%] top-1/2 z-20 -translate-y-1/2">{seatBlock(1, "vertical")}</div>
        <div className="absolute right-[2%] top-1/2 z-20 -translate-y-1/2">{seatBlock(3, "vertical")}</div>
        <div className="absolute left-1/2 top-[54%] z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center [--card-w:clamp(2.4rem,5vw,4.2rem)]">
          {projection.cards.currentTrick.map((play) => <div key={`${play.seatIndex}-${play.card.id}`} className={cn("absolute", TRICK_OFFSET[posOf(play.seatIndex)])}><PlayingCard card={play.card} /></div>)}
        </div>
        <div className="absolute left-1/2 top-[76%] z-20 -translate-x-1/2 rounded-xl bg-black/70 px-4 py-2 text-center text-xs text-white/80">
          {projection.lifecycle === "complete" ? "Το παιχνίδι ολοκληρώθηκε" : projection.progression.phase === "NINE_CARD_TRUMP_CHOICE" ? "Επιλογή ατού" : projection.progression.phase === "DECLARATION" ? "Δηλώσεις" : projection.progression.phase === "JOKER_DECISION" ? "Επιλογή Τζόκερ" : projection.progression.phase === "CARD_PLAY" ? "Παίξιμο φύλλου" : "Ενημέρωση παιχνιδιού"}
        </div>
      </div>
    </main>

    <footer className="absolute inset-x-0 bottom-1 z-40 flex flex-col items-center gap-1">
      {projection.lifecycle === "complete" ? (
        <div className="panel mb-3 w-[min(92vw,42rem)] p-4 text-center"><div className="font-display text-xl text-primary">Τελική κατάταξη</div><div className="mt-2 grid grid-cols-4 gap-2">{names.map((name, seat) => <div key={seat}><div className="text-xs text-muted-foreground">{name}</div><div className="font-display text-lg">#{projection.score.finalPlacements[seat]}</div><div className="text-sm">{projection.score.cumulativeTotals[seat]}</div></div>)}</div></div>
      ) : (
        <>
          <div className="flex max-w-[92vw] flex-wrap items-center justify-center gap-1">
            {declare?.values.map((value) => <JButton key={value} size="sm" disabled={busy} onClick={() => onCommand({ type: "declare", value })}>Δήλωση {value}</JButton>)}
            {chooseTrump?.suits.map((suit) => <JButton key={suit ?? "none"} size="sm" disabled={busy} onClick={() => onCommand({ type: "choose_trump", suit })}>{suitLabel(suit)}</JButton>)}
            {joker?.options.map((semantic, index) => <JButton key={index} size="sm" disabled={busy} onClick={() => onCommand({ type: "choose_joker_semantic", semantic })}>{semantic.context === "OPEN_TRICK" ? semantic.mode === "COMPETE" ? "Τζόκερ: διεκδικώ" : "Τζόκερ: από κάτω" : `${semantic.mode === "HIGHER_SUIT" ? "Μεγαλύτερο" : "Κερδίζει"} ${suitLabel(semantic.requestedSuit)}`}</JButton>)}
            {reclaim && <JButton size="sm" variant="outlineGold" disabled={busy} onClick={onReclaim}>Πάρε ξανά τον έλεγχο</JButton>}
          </div>
          <div className="flex w-full items-end justify-center gap-2 px-3">
            <div className="flex justify-center overflow-visible pt-2 [--card-w:clamp(2.4rem,5.8vw,4.1rem)]">{projection.cards.ownHand.map((card, i) => <div key={card.id} className={cn(i > 0 && "-ml-[calc(var(--card-w)*0.28)]")} style={{ zIndex: i }}><PlayingCard card={card} selected={selectedCardId === card.id} onClick={legalCardIds.has(card.id) && !busy ? () => setSelectedCardId(card.id) : undefined} /></div>)}</div>
            <JButton size="sm" className="mb-2" disabled={!selectedCardId || !legalCardIds.has(selectedCardId) || busy} onClick={async () => { if (selectedCardId) await onCommand({ type: "play_card", cardId: selectedCardId }); }}>Παίξε</JButton>
          </div>
        </>
      )}
      <div>{seatBlock(0, "horizontal")}</div>
    </footer>

    <AuthoritativeScoreboard open={scoreOpen} onClose={() => setScoreOpen(false)} playerNames={names} projection={projection} />
  </div>;
}
