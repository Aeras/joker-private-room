/**
 * Bot strategy — chooses semantic legal actions from a fair PlayerView only.
 * Strength-only concern: never reads personality/speech settings.
 */
import type { Card, Suit } from "@/domain/cards";
import type { JokerSemantic, PlayerView } from "@/domain/engine";

export interface BotStrategy {
  id: string;
  chooseDeclaration(view: PlayerView, legalValues: readonly number[]): number;
  chooseTrump(view: PlayerView, legalSuits: readonly (Suit | null)[]): Suit | null;
  chooseCard(view: PlayerView, legalMoves: readonly Card[]): Card;
  chooseJokerSemantic(view: PlayerView, options: readonly JokerSemantic[]): JokerSemantic;
}

/**
 * Temporary deterministic fallback used only until the tiered permanent-bot
 * strategies land. It now covers the complete canonical decision contract but
 * remains intentionally naive and must not be treated as production strength.
 */
export const placeholderStrategy: BotStrategy = {
  id: "placeholder",
  chooseDeclaration: (_view, legalValues) => legalValues[0]!,
  chooseTrump: (_view, legalSuits) => legalSuits[0]!,
  chooseCard: (_view, legal) => legal[0]!,
  chooseJokerSemantic: (_view, options) => options[0]!,
};
