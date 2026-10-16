import type { BiribaGameView } from "@/services/biribaFunctions";
import type { BiribaCard } from "./rules";
import { publicActionsSince } from "./biribaVisualModel";

/** Local animation is admitted only after an authorized projection confirms the move. */
export function confirmedLocalDraw(
  before: BiribaGameView,
  after: BiribaGameView,
): BiribaCard | null {
  if (before.roundNumber !== after.roundNumber ||
      before.seat !== after.seat || after.revision <= before.revision ||
      before.turn !== before.seat || before.phase !== "draw" ||
      after.turn !== after.seat || after.phase !== "meld" ||
      after.stockCount !== before.stockCount - 1) return null;
  const held = new Set(before.myHand.map((card) => card.id));
  const added = after.myHand.filter((card) => !held.has(card.id));
  return added.length === 1 ? added[0]! : null;
}

export function confirmedLocalDiscard(
  before: BiribaGameView,
  after: BiribaGameView,
  cardId: string,
): BiribaCard | null {
  if (before.roundNumber !== after.roundNumber || before.seat !== after.seat ||
      after.revision <= before.revision || before.turn !== before.seat ||
      before.phase !== "meld" || !before.myHand.some((card) => card.id === cardId) ||
      after.myHand.some((card) => card.id === cardId)) return null;
  const publicEvent = publicActionsSince(before, after).find((event) =>
    event.actorSeat === before.seat && event.kind === "discard" &&
    event.cards.some((card) => card.id === cardId));
  if (publicEvent) return publicEvent.cards.find((card) => card.id === cardId)!;
  // Safe fallback for an older Edge Function: the exact card must be the new top.
  const top = after.discards.at(-1);
  return top?.id === cardId && !before.discards.some((card) => card.id === cardId) ? top : null;
}

export type TablePoint = { x: number; y: number };
export type TableRect = TablePoint & { width: number; height: number };
export type LocalDiscardFlight = { card: BiribaCard; source: TableRect; revision: number };
export type LocalDrawFlight = { card: BiribaCard; revision: number };

/** A foreground refresh can confirm that nothing changed while the tab slept. */
export function isSameBiribaProjection(before: BiribaGameView | null, after: BiribaGameView): boolean {
  return before !== null && before.roundNumber === after.roundNumber && before.revision === after.revision;
}

export function projectCardRect(card: DOMRect, table: DOMRect): TableRect | null {
  if (card.width <= 0 || card.height <= 0 || table.width <= 0 || table.height <= 0)
    return null;
  return {
    x: ((card.left - table.left) / table.width) * 1280,
    y: ((card.top - table.top) / table.height) * 720,
    width: (card.width / table.width) * 1280,
    height: (card.height / table.height) * 720,
  };
}
