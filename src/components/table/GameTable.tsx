import { Link } from "@tanstack/react-router";
import { ArrowLeft, Maximize, Minimize, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { assets } from "@/assets/registry";
import type { Suit } from "@/domain/cards";
import type { GameplayCommand } from "@/domain/gameplayCommands";
import { SEAT_COUNT } from "@/domain/gameConfig";
import type { Room } from "@/domain/players";
import type { LocalLegalAction, PlayerGameProjection } from "@/domain/projection";
import type { ScoreSheet } from "@/domain/scoreSheet";
import { cn } from "@/lib/utils";
import { JButton } from "../joker/JButton";
import { PlayingCard } from "../joker/PlayingCard";
import { Scoreboard } from "./Scoreboard";
import { TableSeat } from "./TableSeat";

type Pos = 0 | 1 | 2 | 3;
type OrientationLock = ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void> };

const TRICK_OFFSET: Record<Pos, string> = {
  0: "translate-y-[38%]",
  1: "-translate-x-[58%] -rotate-6",
  2: "-translate-y-[38%]",
  3: "translate-x-[58%] rotate-6",
};

const SUIT_LABEL: Record<Suit, string> = {
  spades: "♠ Πίκες",
  hearts: "♥ Κούπες",
  diamonds: "♦ Καρό",
  clubs: "♣ Σπαθιά",
};

function authoritativeScoreSheet(projection: PlayerGameProjection): ScoreSheet {
  return {
    deals: projection.score.completedDeals.map((deal) => ({
      dealNumber: deal.dealNumber,
      scores: [...deal.dealScores],
    })),
    special: projection.score.roundPremia.map((record) => ({
      phase: record.round,
      kind: "premia" as const,
      label: "Πρέμια",
      values: [...record.adjustments],
    })),
  };
}

function legalAction<T extends LocalLegalAction["type"]>(
  projection: PlayerGameProjection,
  type: T,
): Extract<LocalLegalAction, { type: T }> | undefined {
  return projection.local.legalActions.find((action) => action.type === type) as
    | Extract<LocalLegalAction, { type: T }>
    | undefined;
}

function publicCardCount(projection: PlayerGameProjection, seat: number): number {
  const completed = projection.cards.completedTricks.reduce(
    (count, trick) => count + trick.cards.filter((play) => play.seatIndex === seat).length,
    0,
  );
  const current = projection.cards.currentTrick.filter((play) => play.seatIndex === seat).length;
  return Math.max(0, projection.progression.cardsPerPlayer - completed - current);
}

function phaseMessage(projection: PlayerGameProjection): string {
  if (projection.lifecycle === "complete") return "Η παρτίδα ολοκληρώθηκε";
  switch (projection.progression.phase) {
    case "INITIAL_DEALER_SELECTION":
      return "Επιλογή πρώτου dealer";
    case "NINE_CARD_TRUMP_CHOICE":
      return "Επιλογή ατού για το 9φυλλο";
    case "DECLARATION":
      return "Δηλώσεις";
    case "CARD_PLAY":
      return "Παίξιμο φύλλου";
    case "JOKER_DECISION":
      return "Επιλογή Joker";
    case "DEAL_RESULT":
      return "Υπολογισμός μοιρασιάς";
    case "PHASE_RESULT":
      return "Υπολογισμός πρέμιας";
    default:
      return "Η παρτίδα εξελίσσεται";
  }
}

function jokerLabel(action: Extract<LocalLegalAction, { type: "choose_joker_semantic" }>["options"][number]): string {
  if (action.context === "OPEN_TRICK") return action.mode === "COMPETE" ? "Joker ψηλά" : "Joker από κάτω";
  const mode = action.mode === "HIGHER_SUIT" ? "Μεγαλύτερο" : "Κερδίζει";
  return `${mode} ${SUIT_LABEL[action.requestedSuit]}`;
}

export function GameTable({
  room,
  projection,
  busy,
  error,
  onCommand,
  onReclaim,
}: {
  room: Room;
  projection: PlayerGameProjection;
  busy: boolean;
  error: string | null;
  onCommand: (command: GameplayCommand) => Promise<void>;
  onReclaim: () => Promise<void>;
}) {
  const tableRootRef = useRef<HTMLDivElement>(null);
  const localSeat = projection.viewerSeat;
  const [scoreOpen, setScoreOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const names = room.seats.map((seat) => {
    const occupant = seat.occupant;
    if (occupant.type === "human") return occupant.player.displayName;
    if (occupant.type === "bot") return occupant.bot.displayName;
    return `Θέση ${seat.index + 1}`;
  });
  const sheet = useMemo(() => authoritativeScoreSheet(projection), [projection]);
  const playAction = legalAction(projection, "play_card");
  const declarationAction = legalAction(projection, "declare");
  const trumpAction = legalAction(projection, "choose_trump");
  const jokerAction = legalAction(projection, "choose_joker_semantic");
  const reclaimAction = legalAction(projection, "reclaim_control");
  const declarationValues = declarationAction
    ? Array.from({ length: projection.progression.cardsPerPlayer + 1 }, (_, value) => value)
    : [];

  const nameAt = (seat: number) => names[seat] ?? `Θέση ${seat + 1}`;
  const seatAt = (pos: Pos) => ((localSeat + pos) % SEAT_COUNT) as Pos;
  const posOf = (seat: number) => ((seat - localSeat + SEAT_COUNT) % SEAT_COUNT) as Pos;

  useEffect(() => {
    const update = () => setPortrait(window.innerHeight > window.innerWidth);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  useEffect(() => {
    const change = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);

  useEffect(() => {
    if (!selectedId || !playAction?.cardIds.includes(selectedId)) setSelectedId(null);
  }, [selectedId, playAction]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await tableRootRef.current?.requestFullscreen();
        const orientation = screen.orientation as OrientationLock;
        await orientation.lock?.("landscape").catch(() => undefined);
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen/orientation support differs by browser/OS. Gameplay does not depend on it.
    }
  };

  const seatBlock = (pos: Pos, orientation: "horizontal" | "vertical") => {
    const seat = seatAt(pos);
    const roomSeat = room.seats[seat];
    if (!roomSeat) return null;
    const publicDeadline = projection.timing?.currentHumanDeadline ?? projection.local.humanDeadline;
    return (
      <TableSeat
        seat={roomSeat}
        orientation={orientation}
        showCards={pos !== 0}
        local={pos === 0}
        stats={{
          totalScore: projection.score.cumulativeTotals[seat],
          declaration: projection.declarations.values[seat],
          tricksTaken: projection.score.tricksTaken[seat],
          isDealer: projection.progression.dealerSeat === seat,
          isActive: projection.progression.currentActorSeat === seat,
          cardCount: publicCardCount(projection, seat),
          humanDeadline: projection.progression.currentActorSeat === seat ? publicDeadline : null,
        }}
      />
    );
  };

  const finalRows = projection.lifecycle === "complete"
    ? projection.score.finalPlacements
        .map((placement, seat) => ({
          seat,
          placement,
          score: projection.score.cumulativeTotals[seat] ?? 0,
        }))
        .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99) || b.score - a.score)
    : [];

  return (
    <div ref={tableRootRef} className="joker-room relative h-dvh w-full overflow-hidden bg-[#090b09]">
      {assets.tableArt && (
        <img src={assets.tableArt} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-center select-none" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/25" />

      {portrait && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/95 px-8 text-center backdrop-blur-sm">
          <div className="max-w-sm rounded-3xl border border-primary/35 bg-card/95 p-6 shadow-2xl">
            <div className="mb-3 text-4xl">↻</div>
            <div className="font-display text-xl text-primary">Γύρισε τη συσκευή οριζόντια</div>
            <p className="mt-2 text-sm text-muted-foreground">Το τραπέζι είναι σχεδιασμένο για landscape προβολή.</p>
            <JButton className="mt-5" variant="outlineGold" onClick={toggleFullscreen}>
              <Maximize className="h-4 w-4" /> Πλήρης οθόνη
            </JButton>
          </div>
        </div>
      )}

      <header className="absolute inset-x-0 top-0 z-50 flex items-center gap-1 px-[max(.35rem,env(safe-area-inset-left))] pt-[max(.25rem,env(safe-area-inset-top))]">
        <Link to="/lobby" search={{ code: room.code }} aria-label="Πίσω" className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white/75 backdrop-blur">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="ml-2 rounded-lg bg-black/60 px-2 py-1 text-xs text-white/75 backdrop-blur">
          Γύρος {projection.progression.round} · Μοιρασιά {projection.progression.dealNumber}/24 · {phaseMessage(projection)}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <JButton variant="outlineGold" size="sm" className="h-8 px-2 bg-black/60" onClick={() => setScoreOpen(true)} aria-label="Σκορ">
            <Trophy className="h-4 w-4" /><span className="hidden lg:inline">Σκορ</span>
          </JButton>
          <JButton variant="outlineGold" size="sm" className="h-8 px-2 bg-black/60" onClick={toggleFullscreen} aria-label={fullscreen ? "Έξοδος από πλήρη οθόνη" : "Πλήρης οθόνη"}>
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </JButton>
        </div>
      </header>

      <main className="absolute inset-x-[5vw] top-[10vh] bottom-[27vh]">
        <div className="relative h-full w-full">
          <div className="absolute left-1/2 top-[1%] z-20 -translate-x-1/2">{seatBlock(2, "horizontal")}</div>
          <div className="absolute left-[2%] top-[50%] z-20 -translate-y-1/2">{seatBlock(1, "vertical")}</div>
          <div className="absolute right-[2%] top-[50%] z-20 -translate-y-1/2">{seatBlock(3, "vertical")}</div>

          <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center [--card-w:clamp(3rem,6vw,5rem)]">
            {projection.cards.currentTrick.map((play) => (
              <div key={`${play.seatIndex}-${play.card.id}`} className={cn("animate-card-drop absolute", TRICK_OFFSET[posOf(play.seatIndex)])}>
                <PlayingCard card={play.card} />
              </div>
            ))}
          </div>

          {projection.cards.exposedTrumpCard && (
            <div className="absolute left-[59%] top-[54%] -translate-y-1/2 [--card-w:clamp(2rem,4vw,3.4rem)]">
              <div className="mb-1 text-center text-[10px] uppercase tracking-wider text-white/60">Ατού</div>
              <PlayingCard card={projection.cards.exposedTrumpCard} />
            </div>
          )}
        </div>
      </main>

      <footer className="absolute inset-x-0 bottom-[max(.15rem,env(safe-area-inset-bottom))] z-40 flex flex-col items-center">
        {error && <div className="mb-1 rounded-lg bg-black/80 px-3 py-1 text-xs text-negative">{error}</div>}

        {declarationAction && (
          <div className="mb-3 max-w-[94vw] rounded-2xl border border-primary/30 bg-black/80 p-3 text-center shadow-2xl backdrop-blur">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Δήλωσε μπάζες</div>
            <div className="flex flex-wrap justify-center gap-2">
              {declarationValues.map((value) => {
                const allowed = declarationAction.values.includes(value);
                return (
                  <JButton
                    key={value}
                    size="sm"
                    className="h-12 min-w-12 px-4 text-base font-bold"
                    disabled={busy || !allowed}
                    aria-disabled={busy || !allowed}
                    title={!allowed ? "Μη επιτρεπτή δήλωση για τον dealer" : `Δήλωση ${value}`}
                    onClick={() => allowed && onCommand({ type: "declare", value })}
                  >
                    {value}
                  </JButton>
                );
              })}
            </div>
          </div>
        )}

        {trumpAction && (
          <div className="mb-2 flex max-w-[94vw] flex-wrap justify-center gap-1 rounded-xl bg-black/70 p-2 backdrop-blur">
            {trumpAction.suits.map((suit) => (
              <JButton key={suit ?? "none"} size="sm" disabled={busy} onClick={() => onCommand({ type: "choose_trump", suit })}>
                {suit ? SUIT_LABEL[suit] : "Χωρίς ατού"}
              </JButton>
            ))}
          </div>
        )}

        {jokerAction && (
          <div className="mb-2 flex max-w-[94vw] flex-wrap justify-center gap-1 rounded-xl bg-black/70 p-2 backdrop-blur">
            {jokerAction.options.map((semantic, index) => (
              <JButton key={`${semantic.context}-${semantic.mode}-${index}`} size="sm" disabled={busy} onClick={() => onCommand({ type: "choose_joker_semantic", semantic })}>
                {jokerLabel(semantic)}
              </JButton>
            ))}
          </div>
        )}

        {reclaimAction && (
          <JButton className="mb-2" variant="outlineGold" size="sm" disabled={busy} onClick={onReclaim}>
            Πάρε ξανά τον έλεγχο
          </JButton>
        )}

        <div className="flex w-full items-end justify-center px-3 pl-[clamp(7rem,17vw,11rem)]">
          <div className="flex justify-center overflow-visible pt-2 [--card-w:clamp(3rem,7.2vw,5rem)]">
            {projection.cards.ownHandVisible ? projection.cards.ownHand.map((card, index) => (
              <div key={card.id} className={cn(index > 0 && "-ml-[calc(var(--card-w)*0.36)]")} style={{ zIndex: index }}>
                <PlayingCard
                  card={card}
                  selected={selectedId === card.id}
                  onClick={playAction?.cardIds.includes(card.id) && !busy ? () => setSelectedId(selectedId === card.id ? null : card.id) : undefined}
                />
              </div>
            )) : (
              <div className="rounded-lg bg-black/65 px-4 py-2 text-xs text-white/65">Τα φύλλα σου δεν είναι ακόμη ορατά.</div>
            )}
          </div>
          {playAction && (
            <JButton
              size="sm"
              className="mb-2 ml-2 shrink-0"
              disabled={!selectedId || busy || !playAction.cardIds.includes(selectedId)}
              onClick={async () => {
                if (!selectedId) return;
                await onCommand({ type: "play_card", cardId: selectedId });
                setSelectedId(null);
              }}
            >
              Παίξε
            </JButton>
          )}
        </div>
        <div className="absolute bottom-0 left-[max(.65rem,env(safe-area-inset-left))]">{seatBlock(0, "horizontal")}</div>
      </footer>

      {projection.lifecycle === "complete" && (
        <div className="absolute inset-0 z-[90] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-primary/40 bg-card/95 p-6 text-center shadow-2xl">
            <h2 className="font-display text-2xl text-primary">Τελικό αποτέλεσμα</h2>
            <div className="mt-4 space-y-2">
              {finalRows.map((row) => (
                <div key={row.seat} className="flex items-center justify-between rounded-xl bg-secondary/70 px-4 py-2">
                  <span>{row.placement}η θέση · {nameAt(row.seat)}</span>
                  <strong className="tabular-nums">{row.score}</strong>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-center gap-2">
              <JButton variant="outlineGold" onClick={() => setScoreOpen(true)}>Αναλυτικό σκορ</JButton>
              <Link to="/" className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground">Αρχική</Link>
            </div>
          </div>
        </div>
      )}

      <Scoreboard open={scoreOpen} onClose={() => setScoreOpen(false)} playerNames={names} sheet={sheet} />
    </div>
  );
}
