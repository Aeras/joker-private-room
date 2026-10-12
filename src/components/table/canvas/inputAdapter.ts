import type { PlayerGameProjection } from "@/domain/projection";
import type { CardReleaseRect } from "../useTableGeometry";
export interface PlayIntent { cardId: string; release: CardReleaseRect }
/** Optional future Canvas hit targets use the same authorized DOM intent callback.
 * Visual hit-testing never grants legality or confirms a command. */
export async function dispatchPlayIntent(p: PlayerGameProjection, intent: PlayIntent, submit: (cardId: string, release: CardReleaseRect) => Promise<void>): Promise<boolean> {
  const seat = p.seats[p.viewerSeat];
  const legal = p.local.legalActions.find(action => action.type === "play_card");
  if (seat.controller !== "human" || !p.cards.ownHandVisible || !p.cards.ownHand.some(card => card.id === intent.cardId) || !legal?.cardIds.includes(intent.cardId)) return false;
  await submit(intent.cardId, intent.release);
  return true;
}

