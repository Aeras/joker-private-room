/**
 * Bot strategy — decides bids and cards from a fair PlayerView only.
 * Strength-only concern: never reads personality/speech settings.
 */
import type { Card } from "@/domain/cards";
import type { PlayerView } from "@/domain/engine";

export interface BotStrategy {
  id: string;
  chooseDeclaration(view: PlayerView): number;
  chooseCard(view: PlayerView, legalMoves: Card[]): Card;
}

/** Placeholder until the real strategy is built. Deterministic, intentionally naive. */
export const placeholderStrategy: BotStrategy = {
  id: "placeholder",
  chooseDeclaration: () => 0,
  chooseCard: (_view, legal) => legal[0]!,
};
