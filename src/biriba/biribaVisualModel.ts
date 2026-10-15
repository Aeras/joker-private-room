import type { BiribaCard, BiribaMeld } from "./rules";
import { opponentFanPose, type BiribaOpponentSide } from "./tableLayout";

export type BiribaVisualGame = {
  seats: 2 | 4;
  seat: number;
  roundNumber: number;
  revision: number;
  stockCount: number;
  packetCounts: number[];
  handCounts: number[];
  discards: BiribaCard[];
  turn?: number;
  phase?: string;
  melds?: BiribaMeld[];
  myHand?: BiribaCard[];
};

export type VisualCard = {
  id: string;
  artwork: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
};

export const BACK_ARTWORK = "/cards/optimized-png/backs/blue_back.png";

export function biribaDealKey(roomCode: string, roundNumber: number, seat: number): string {
  return `${roomCode}:${roundNumber}:${seat}`;
}

export function biribaCardArtwork(card: BiribaCard): string {
  if (card.joker) return "/cards/optimized-png/faces/joker_red.png";
  const rank =
    ({ 1: "ace", 11: "jack", 12: "queen", 13: "king" } as Record<number, string>)[card.rank] ??
    card.rank;
  return `/cards/optimized-png/faces/${card.suit}_${rank}.png`;
}

export function visibleOpponentSides(
  game: BiribaVisualGame,
): Array<{ side: BiribaOpponentSide; seat: number }> {
  const top = game.seats === 2 ? 1 : 2;
  const sides: Array<{ side: BiribaOpponentSide; seat: number }> = [
    { side: "top", seat: (game.seat + top) % game.seats },
  ];
  if (game.seats === 4) {
    sides.push({ side: "left", seat: (game.seat + 1) % game.seats });
    sides.push({ side: "right", seat: (game.seat + 3) % game.seats });
  }
  return sides;
}

export function biribaVisualCards(game: BiribaVisualGame, includeFans = true): VisualCard[] {
  const cards: VisualCard[] = [];
  const pile = (id: string, x: number, y: number, count: number) => {
    for (let index = 0; index < count; index++) {
      cards.push({
        id: `${id}:${index}`,
        artwork: BACK_ARTWORK,
        x: x + index * 2,
        y: y - index * 2,
        width: 68.44,
        height: 100.3,
        angle: 0,
      });
    }
  };
  pile("stock", 440, 395, Math.min(3, game.stockCount));
  pile("packet:0", 664, 395, game.packetCounts[0] ? 2 : 0);
  pile("packet:1", 766, 395, game.packetCounts[1] ? 2 : 0);
  const discard = game.discards.at(-1);
  if (discard)
    cards.push({
      id: "discard:top",
      artwork: biribaCardArtwork(discard),
      x: 548,
      y: 395,
      width: 68.44,
      height: 100.3,
      angle: 0,
    });
  if (includeFans)
    for (const { side, seat } of visibleOpponentSides(game)) {
      const count = Math.max(0, Math.min(14, game.handCounts[seat] ?? 0));
      for (let index = 0; index < count; index++) {
        const pose = opponentFanPose(side, index, count);
        cards.push({
          id: `fan:${side}:${index}`,
          artwork: BACK_ARTWORK,
          x: pose.x,
          y: pose.y,
          width: side === "top" ? 58 : 75,
          height: side === "top" ? 82 : 105,
          angle: pose.angle,
        });
      }
    }
  return cards;
}

export function admitBiribaRevision(
  current: BiribaVisualGame | null,
  next: BiribaVisualGame,
): boolean {
  return (
    current === null ||
    next.roundNumber > current.roundNumber ||
    (next.roundNumber === current.roundNumber && next.revision > current.revision)
  );
}

export function shouldAnimateFreshDeal(
  game: BiribaVisualGame & { phase: string; melds: unknown[] },
): boolean {
  return (
    game.phase === "draw" &&
    game.melds.length === 0 &&
    game.handCounts.every((count) => count === 11)
  );
}

/** A revision may include many bot steps; only animate a discard provably from our prior hand. */
export function newDiscardFromSingleMove(
  previous: BiribaVisualGame | null,
  next: BiribaVisualGame,
): BiribaCard | null {
  if (
    !previous ||
    previous.roundNumber !== next.roundNumber ||
    next.revision !== previous.revision + 1 ||
    previous.phase !== "meld" ||
    previous.turn === undefined ||
    previous.turn !== previous.seat ||
    !previous.myHand ||
    next.discards.length !== previous.discards.length + 1
  )
    return null;
  const card = next.discards.at(-1);
  return card &&
    previous.myHand.some((held) => held.id === card.id) &&
    !previous.discards.some((discard) => discard.id === card.id)
    ? card
    : null;
}

export type MeldFlight = { card: BiribaCard; actorSeat: number };

/** Never guess which bot played a public card from a batched projection. */
export function newMeldCardsFromSingleMove(
  previous: BiribaVisualGame | null,
  next: BiribaVisualGame,
): MeldFlight[] {
  if (
    !previous ||
    previous.roundNumber !== next.roundNumber ||
    next.revision !== previous.revision + 1 ||
    previous.phase !== "meld" ||
    previous.turn === undefined ||
    previous.turn !== previous.seat ||
    !previous.myHand ||
    !previous.melds ||
    !next.melds
  )
    return [];
  const existing = new Set(
    previous.melds.flatMap((meld) => meld.cards.map((placement) => placement.card.id)),
  );
  const held = new Set(previous.myHand.map((card) => card.id));
  return next.melds.flatMap((meld) =>
    meld.cards
      .filter((placement) => !existing.has(placement.card.id) && held.has(placement.card.id))
      .map((placement) => ({ card: placement.card, actorSeat: previous.seat })),
  );
}
