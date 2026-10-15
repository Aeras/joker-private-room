import type { BiribaMatch } from "./engine.ts";
import type { BiribaCard } from "./rules.ts";

/** Only cards that have become public may enter this bounded presentation journal. */
export type BiribaPublicAction = {
  sequence: number;
  round: number;
  actorSeat: number;
  kind: "discard" | "meld";
  cards: BiribaCard[];
};

const JOURNAL_LIMIT = 128;

export function recordBiribaPublicActions(
  before: BiribaMatch,
  after: BiribaMatch,
  actorSeat: number,
): BiribaMatch {
  const additions: Array<Omit<BiribaPublicAction, "sequence" | "round" | "actorSeat">> = [];
  for (let index = 0; index < after.melds.length; index++) {
    const oldIds = new Set(before.melds[index]?.cards.map(({ card }) => card.id) ?? []);
    const cards = after.melds[index]!.cards.map(({ card }) => card).filter(
      (card) => !oldIds.has(card.id),
    );
    if (cards.length) additions.push({ kind: "meld", cards });
  }
  const previousDiscards = new Set(before.discards.map((card) => card.id));
  const discarded = after.discards.filter((card) => !previousDiscards.has(card.id));
  if (discarded.length) additions.push({ kind: "discard", cards: discarded });
  if (!additions.length) return after;

  let sequence = Math.max(0, before.publicActionSequence ?? 0);
  const prior = before.publicActions ?? [];
  const events = additions.map((action): BiribaPublicAction => ({
    ...action,
    sequence: ++sequence,
    round: after.roundNumber,
    actorSeat,
  }));
  return {
    ...after,
    publicActionSequence: sequence,
    publicActions: [...prior, ...events].slice(-JOURNAL_LIMIT),
  };
}
