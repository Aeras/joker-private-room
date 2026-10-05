import { Link } from "@tanstack/react-router";
import { ArrowLeft, Maximize, Minimize, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assets } from "@/assets/registry";
import type { Suit } from "@/domain/cards";
import type { GameplayCommand } from "@/domain/gameplayCommands";
import { SEAT_COUNT } from "@/domain/gameConfig";
import type { Room } from "@/domain/players";
import type { LocalLegalAction, PlayerGameProjection } from "@/domain/projection";
import type { ScoreSheet } from "@/domain/scoreSheet";
import { JButton } from "../joker/JButton";
import { PlayingCard } from "../joker/PlayingCard";
import { DealerSelectionPresentation } from "./DealerSelectionPresentation";
import { DealPresentation } from "./DealPresentation";
import { DeclarationPicker } from "./DeclarationPicker";
import { JokerChoicePicker } from "./JokerChoicePicker";
import { LocalHandRow } from "./LocalHandRow";
import {
  projectionContainsPendingCard,
  type LocalPlayPresentation,
} from "./localPlayPresentation";
import { dealerSelectionNeedsPresentation } from "./dealerSelectionPresentationModel";
import { SoundToggle } from "./SoundToggle";
import { Scoreboard } from "./Scoreboard";
import { TableSeat } from "./TableSeat";
import { TableUtilityMenu } from "./TableUtilityMenu";
import { TrickPresentation } from "./TrickPresentation";
import { useTableGeometry, type RectLike } from "./useTableGeometry";

type Pos = 0 | 1 | 2 | 3;
type OrientationLock = ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void> };

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
    Extract<LocalLegalAction, { type: T }> | undefined;
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
  if (projection.lifecycle === "complete") {
    return projection.termination?.kind === "host_ended"
      ? "Η παρτίδα τερματίστηκε"
      : "Η παρτίδα ολοκληρώθηκε";
  }
  switch (projection.progression.phase) {
    case "INITIAL_DEALER_SELECTION": return "Επιλογή πρώτου dealer";
    case "NINE_CARD_TRUMP_CHOICE": return "Επιλογή ατού για το 9φυλλο";
    case "DECLARATION": return "Δηλώσεις";
    case "CARD_PLAY": return "Παίξιμο φύλλου";
    case "JOKER_DECISION": return "Επιλογή Joker";
    case "DEAL_RESULT": return "Υπολογισμός μοιρασιάς";
    case "PHASE_RESULT": return "Υπολογισμός πρέμιας";
    default: return "Η παρτίδα εξελίσσεται";
  }
}

export function GameTable({
  room,
  projection,
  busy,
  error,
  onCommand,
  onReclaim,
  onEndGame,
}: {
  room: Room;
  projection: PlayerGameProjection;
  busy: boolean;
  error: string | null;
  onCommand: (command: GameplayCommand) => Promise<PlayerGameProjection | null>;
  onReclaim: () => Promise<void>;
  onEndGame: () => Promise<boolean>;
}) {
  const tableRootRef = useRef<HTMLDivElement>(null);
  const playSubmissionLock = useRef(false);
  const tableGeometry = useTableGeometry();
  const localSeat = projection.viewerSeat;
  const [scoreOpen, setScoreOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [submittingCardId, setSubmittingCardId] = useState<string | null>(null);
  const [pendingDeclarationValue, setPendingDeclarationValue] = useState<number | null>(null);
  const [localPlayPresentation, setLocalPlayPresentation] = useState<LocalPlayPresentation | null>(null);
  const [dealerIntroActive, setDealerIntroActive] = useState(() => dealerSelectionNeedsPresentation(projection));
  const [dealPresentationActive, setDealPresentationActive] = useState(false);
  const startupPresentationActive = dealerIntroActive || dealPresentationActive;
  const clearLocalFlight = useCallback(() => setLocalPlayPresentation(null), []);

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
    ? Array.from({ length: 10 }, (_, value) => value)
    : [];
  const viewerOccupant = room.seats[localSeat]?.occupant;
  const isHost = viewerOccupant?.type === "human" && viewerOccupant.player.id === room.hostId;
  const handAuthorityKey = [
    projection.gameId,
    projection.stateVersion,
    projection.progression.phase,
    projection.progression.currentActorSeat ?? "none",
    playAction?.cardIds.join(",") ?? "none",
    projection.cards.ownHand.map((card) => card.id).join(","),
  ].join(":");

  const nameAt = (seat: number) => names[seat] ?? `Θέση ${seat + 1}`;
  const seatAt = (pos: Pos) => ((localSeat + pos) % SEAT_COUNT) as Pos;
  const presentedPhaseMessage = dealerIntroActive
    ? "Επιλογή πρώτου dealer"
    : dealPresentationActive
      ? "Μοίρασμα φύλλων"
      : phaseMessage(projection);

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
    const epoch = tableGeometry.geometry?.epoch ?? 0;
    setLocalPlayPresentation((current) =>
      current && current.geometryEpoch !== epoch ? null : current,
    );
  }, [tableGeometry.geometry?.epoch]);

  useEffect(() => {
    if (!declarationAction) setPendingDeclarationValue(null);
  }, [projection.stateVersion, declarationAction]);

  useEffect(() => {
    setDealerIntroActive(dealerSelectionNeedsPresentation(projection));
  }, [projection.gameId, projection.initialDealerSelection?.status === "resolved"
    ? projection.initialDealerSelection.resolvedAtStateVersion
    : null]);

  const commitCard = async (cardId: string, releaseRect: RectLike) => {
    if (!playAction?.cardIds.includes(cardId) || busy || playSubmissionLock.current) return;
    const card = projection.cards.ownHand.find((candidate) => candidate.id === cardId);
    if (!card) return;

    playSubmissionLock.current = true;
    setSubmittingCardId(cardId);
    const geometryEpoch = tableGeometry.geometry?.epoch ?? 0;
    const presentation: LocalPlayPresentation | null = tableGeometry.geometry
      ? {
          gameId: projection.gameId,
          dealNumber: projection.progression.dealNumber,
          card,
          cardId,
          actorSeat: localSeat,
          sourceStateVersion: projection.stateVersion,
          acceptedStateVersion: null,
          geometryEpoch,
          releaseRect,
          status: "submitted",
        }
      : null;
    setLocalPlayPresentation(presentation);

    try {
      const authoritative = await onCommand({ type: "play_card", cardId });
      if (
        !authoritative ||
        !presentation ||
        authoritative.gameId !== presentation.gameId ||
        authoritative.progression.dealNumber !== presentation.dealNumber ||
        authoritative.stateVersion <= presentation.sourceStateVersion ||
        !projectionContainsPendingCard(
          presentation,
          authoritative.cards.currentTrick,
          authoritative.cards.completedTricks,
        )
      ) {
        setLocalPlayPresentation((current) =>
          current && current.cardId === cardId ? { ...current, status: "rejected" } : current,
        );
        return;
      }
      setLocalPlayPresentation((current) =>
        current && current.cardId === cardId && current.sourceStateVersion === presentation.sourceStateVersion
          ? { ...current, status: "accepted", acceptedStateVersion: authoritative.stateVersion }
          : current,
      );
    } finally {
      playSubmissionLock.current = false;
      setSubmittingCardId(null);
    }
  };

  const submitDeclaration = async (value: number) => {
    if (!declarationAction?.values.includes(value) || pendingDeclarationValue != null || busy) return;
    setPendingDeclarationValue(value);
    const result = await onCommand({ type: "declare", value });
    if (!result) setPendingDeclarationValue(null);
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        const root = document.getElementById("table-fullscreen-root") ?? tableRootRef.current;
        await root?.requestFullscreen();
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
        showCards={pos !== 0 && !startupPresentationActive}
        local={pos === 0}
        stats={{
          totalScore: projection.score.cumulativeTotals[seat],
          declaration: startupPresentationActive ? null : projection.declarations.values[seat],
          tricksTaken: projection.score.tricksTaken[seat],
          isDealer: !dealerIntroActive && projection.progression.dealerSeat === seat,
          isActive: !startupPresentationActive && projection.progression.currentActorSeat === seat,
          cardCount: startupPresentationActive ? 0 : publicCardCount(projection, seat),
          humanDeadline: !startupPresentationActive && projection.progression.currentActorSeat === seat ? publicDeadline : null,
          isTemporarilyControlled: projection.seats[seat].owner.type === "human" && projection.seats[seat].controller === "temporary_bot",
        }}
      />
    );
  };

  const forcedEnd = projection.termination?.kind === "host_ended";
  const finalRows =
    projection.lifecycle === "complete" && !forcedEnd
      ? projection.score.finalPlacements
          .map((placement, seat) => ({ seat, placement, score: projection.score.cumulativeTotals[seat] ?? 0 }))
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
          Γύρος {projection.progression.round} · Μοιρασιά {projection.progression.dealNumber}/24 · {presentedPhaseMessage}
        </div>
        <div className="ml-auto flex items-center gap-1 pr-[max(0rem,env(safe-area-inset-right))]">
          <SoundToggle />
          <JButton variant="outlineGold" size="sm" className="h-8 px-2 bg-black/60" onClick={() => setScoreOpen(true)} aria-label="Σκορ">
            <Trophy className="h-4 w-4" />
            <span className="hidden lg:inline">Σκορ</span>
          </JButton>
          <TableUtilityMenu isHost={isHost} disabled={busy || projection.lifecycle === "complete"} onEndGame={onEndGame} />
          <JButton variant="outlineGold" size="sm" className="h-8 px-2 bg-black/60" onClick={toggleFullscreen} aria-label={fullscreen ? "Έξοδος από πλήρη οθόνη" : "Πλήρης οθόνη"}>
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </JButton>
        </div>
      </header>

      <main className="absolute inset-x-[5vw] top-[10vh] bottom-[27vh]">
        <div ref={tableGeometry.feltRef} className="relative h-full w-full">
          <div ref={tableGeometry.topSeatRef} className="absolute left-1/2 top-[1%] z-20 -translate-x-1/2">{seatBlock(2, "horizontal")}</div>
          <div ref={tableGeometry.leftSeatRef} className="absolute left-[2%] top-[50%] z-20 -translate-y-1/2">{seatBlock(1, "vertical")}</div>
          <div ref={tableGeometry.rightSeatRef} className="absolute right-[2%] top-[50%] z-20 -translate-y-1/2">{seatBlock(3, "vertical")}</div>

          <DealerSelectionPresentation projection={projection} geometry={tableGeometry.geometry} onActiveChange={setDealerIntroActive} />
          {!startupPresentationActive && (
            <TrickPresentation projection={projection} geometry={tableGeometry.geometry} localPlayPresentation={localPlayPresentation} onLocalFlightSettled={clearLocalFlight} />
          )}
        </div>
      </main>

      {!startupPresentationActive && projection.cards.exposedTrumpCard && (
        <div className="pointer-events-none absolute left-[72%] top-[10vh] z-30 -translate-x-1/2 [--card-w:clamp(2.8rem,5vw,4rem)]">
          <div className="mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Ατού</div>
          <PlayingCard card={projection.cards.exposedTrumpCard} />
        </div>
      )}

      <DealPresentation
        projection={projection}
        geometry={tableGeometry.geometry}
        paused={dealerIntroActive}
        onActiveChange={setDealPresentationActive}
      />

      <footer className="absolute inset-x-0 bottom-[max(.15rem,env(safe-area-inset-bottom))] z-40 flex flex-col items-center">
        {error && <div className="mb-1 rounded-lg bg-black/80 px-3 py-1 text-xs text-negative">{error}</div>}

        {!startupPresentationActive && declarationAction && pendingDeclarationValue == null && (
          <DeclarationPicker values={declarationValues} legalValues={declarationAction.values} busy={busy} onSelect={(value) => void submitDeclaration(value)} />
        )}

        {!startupPresentationActive && pendingDeclarationValue != null && (
          <div className="mb-2 rounded-lg bg-black/70 px-3 py-1 text-xs text-white/60">Η δήλωση καταχωρείται…</div>
        )}

        {!startupPresentationActive && trumpAction && (
          <div className="mb-2 flex max-w-[94vw] flex-wrap justify-center gap-1 rounded-xl bg-black/70 p-2 backdrop-blur">
            {trumpAction.suits.map((suit) => (
              <JButton key={suit ?? "none"} size="sm" disabled={busy} onClick={() => onCommand({ type: "choose_trump", suit })}>
                {suit ? SUIT_LABEL[suit] : "Χωρίς ατού"}
              </JButton>
            ))}
          </div>
        )}

        {!startupPresentationActive && jokerAction && (
          <JokerChoicePicker
            options={jokerAction.options}
            busy={busy}
            onSelect={(semantic) => void onCommand({ type: "choose_joker_semantic", semantic })}
          />
        )}

        {!startupPresentationActive && reclaimAction && (
          <JButton className="mb-2" variant="outlineGold" size="sm" disabled={busy} onClick={onReclaim}>Πάρε ξανά τον έλεγχο</JButton>
        )}

        <LocalHandRow
          cards={startupPresentationActive ? [] : projection.cards.ownHand}
          visible={!startupPresentationActive && projection.cards.ownHandVisible}
          legalCardIds={startupPresentationActive ? [] : playAction?.cardIds ?? []}
          blocked={startupPresentationActive || busy || Boolean(submittingCardId)}
          pendingCardId={startupPresentationActive ? null : localPlayPresentation?.cardId ?? null}
          authorityKey={handAuthorityKey}
          geometry={tableGeometry.geometry}
          onCommit={commitCard}
        />
        <div ref={tableGeometry.localSeatRef} className="absolute bottom-0 left-[max(.65rem,env(safe-area-inset-left))]">{seatBlock(0, "horizontal")}</div>
      </footer>

      {projection.lifecycle === "complete" && (
        <div className="absolute inset-0 z-[90] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-primary/40 bg-card/95 p-6 text-center shadow-2xl">
            <h2 className="font-display text-2xl text-primary">{forcedEnd ? "Η παρτίδα τερματίστηκε" : "Τελικό αποτέλεσμα"}</h2>
            {forcedEnd ? (
              <p className="mt-3 text-sm text-white/70">Ο host τερμάτισε την παρτίδα. Όλοι οι παίκτες έχουν αποδεσμευτεί.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {finalRows.map((row) => (
                  <div key={row.seat} className="flex items-center justify-between rounded-xl bg-secondary/70 px-4 py-2">
                    <span>{row.placement}η θέση · {nameAt(row.seat)}</span>
                    <strong className="tabular-nums">{row.score}</strong>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 flex justify-center gap-2">
              {!forcedEnd && <JButton variant="outlineGold" onClick={() => setScoreOpen(true)}>Αναλυτικό σκορ</JButton>}
              <Link to="/" className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground">Αρχική</Link>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-[120]">
        <Scoreboard open={scoreOpen} onClose={() => setScoreOpen(false)} playerNames={names} sheet={sheet} projection={projection} />
      </div>
    </div>
  );
}
