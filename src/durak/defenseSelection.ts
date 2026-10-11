import type { DurakMove, DurakPair } from "./engine";
import type { DurakCard } from "./rules";

/** Presentation preference only: every result comes from the server's legal actions. */
export function durakTapMove(
  card: DurakCard,
  legalMoves: readonly DurakMove[],
  pairs: readonly DurakPair[],
  target: number | null,
): DurakMove | undefined {
  const moves = legalMoves.filter(
    (move) => "card" in move && move.card.suit === card.suit && move.card.rank === card.rank,
  );
  const defenses = moves.filter((move) => move.type === "defend");
  if (target !== null) return defenses.find((move) => move.pair === target);
  return (
    defenses.find((move) => pairs[move.pair]?.attack.suit === card.suit) ??
    moves.find((move) => move.type === "transfer") ??
    defenses[0] ??
    moves.find((move) => move.type === "attack")
  );
}

/** A drop never silently switches to a different attack or a transfer. */
export function durakDropMove(card: DurakCard, legalMoves: readonly DurakMove[], target: number) {
  return legalMoves.find(
    (move) =>
      move.type === "defend" &&
      move.pair === target &&
      move.card.suit === card.suit &&
      move.card.rank === card.rank,
  );
}
