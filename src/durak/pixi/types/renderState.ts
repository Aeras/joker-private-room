import type { DurakCard, DurakSuit, DurakVariant } from "@/durak/rules";
import type { DurakMove, DurakPair } from "@/durak/engine";

/** Sanitized visual player representation for Pixi scene.
 * Invariant: Never contains hidden cards of opponents.
 */
export type DurakPlayerRenderState = {
  readonly seat: number;
  readonly relativeSeat: number;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly handCount: number;
  readonly role: "attacker" | "defender" | "idle";
  readonly isLocal: boolean;
  readonly isActive: boolean;
};

/** Sanitized authoritative snapshot passed to Durak Pixi runtime.
 * Pure presentation model derived strictly from public game state.
 */
export type DurakRenderState = {
  readonly revision: number;
  readonly round: number;
  readonly localSeat: number;
  readonly playerCount: 2 | 3 | 4 | 5 | 6;
  readonly players: readonly DurakPlayerRenderState[];
  readonly localHand: readonly DurakCard[];
  readonly stockCount: number;
  readonly trumpCard: DurakCard;
  readonly trumpSuit: DurakSuit;
  readonly pairs: readonly DurakPair[];
  readonly discardCount: number;
  readonly legalMoves: readonly DurakMove[];
  readonly isBusy: boolean;
  readonly isDealing: boolean;
  readonly isPresenting: boolean;
  readonly isEnded: boolean;
  readonly variant: DurakVariant;
};
