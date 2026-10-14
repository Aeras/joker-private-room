import { biribaAction, type BiribaAction, type BiribaMatch } from "./engine.ts";
import {
  BIRIBA_SUITS,
  biribaCanFinish,
  biribaCardPoints,
  biribaMeldBonus,
  biribaMeldDirty,
  biribaMeldValid,
  biribaTeamOf,
  type BiribaCard,
  type BiribaMeld,
  type BiribaSuit,
} from "./rules.ts";

type Candidate = { action: BiribaAction; meld: BiribaMeld; index?: number; score: number };
const natural = (card: BiribaCard): card is Extract<BiribaCard, { joker?: false }> => !card.joker;
const isWildPlacement = (card: BiribaCard, suit: BiribaSuit, value: number) =>
  card.joker || (card.rank === 2 && (card.suit !== suit || value !== 2));
const cardValue = (card: BiribaCard, highAce: boolean) =>
  card.joker ? -1 : card.rank === 1 && highAce ? 14 : card.rank;

/** Enumerate runs from visible cards only. This variant permits runs, never equal-rank sets. */
function runs(
  cards: readonly BiribaCard[],
  seat: number,
  preferred: ReadonlySet<string> = new Set(),
): BiribaMeld[] {
  const result: BiribaMeld[] = [];
  const seen = new Set<string>();
  for (const suit of BIRIBA_SUITS) {
    for (const highAce of [false, true]) {
      for (let first = highAce ? 3 : 1; first <= (highAce ? 12 : 11); first++) {
        for (let last = first + 2; last <= (highAce ? 14 : 13); last++) {
          if (highAce && last !== 14) continue;
          const used = new Set<string>();
          const placements: BiribaMeld["cards"] = [];
          let missing = -1;
          for (let value = first; value <= last; value++) {
            const choices = cards.filter(
              (card) =>
                natural(card) &&
                card.suit === suit &&
                cardValue(card, highAce) === value &&
                !used.has(card.id),
            );
            choices.sort(
              (a, b) =>
                Number(preferred.has(b.id)) - Number(preferred.has(a.id)) ||
                a.id.localeCompare(b.id),
            );
            const chosen = choices[0];
            if (chosen) {
              placements.push({ card: chosen, value });
              used.add(chosen.id);
            } else if (missing < 0) {
              missing = value;
            } else {
              break;
            }
          }
          if (placements.length + Number(missing >= 0) !== last - first + 1) continue;
          if (missing >= 0) {
            const wild = cards
              .filter((card) => !used.has(card.id) && isWildPlacement(card, suit, missing))
              .sort(
                (a, b) =>
                  Number(preferred.has(b.id)) - Number(preferred.has(a.id)) ||
                  biribaCardPoints(a) - biribaCardPoints(b) ||
                  a.id.localeCompare(b.id),
              )[0];
            if (!wild) continue;
            placements.push({ card: wild, value: missing });
          }
          placements.sort((a, b) => a.value - b.value);
          const meld: BiribaMeld = { ownerSeat: seat, suit, highAce, cards: placements };
          if (!biribaMeldValid(meld)) continue;
          const key = placements
            .map((p) => p.card.id)
            .sort()
            .join("|");
          if (seen.has(key)) continue;
          seen.add(key);
          result.push(meld);
        }
      }
    }
  }
  return result;
}

function extensions(match: BiribaMatch, seat: number, cards: readonly BiribaCard[]): Candidate[] {
  const team = biribaTeamOf(seat, match.seats);
  const result: Candidate[] = [];
  for (let index = 0; index < match.melds.length; index++) {
    const old = match.melds[index]!;
    if (
      biribaTeamOf(old.ownerSeat, match.seats) !== team ||
      (old.ownerSeat !== seat && !match.opened[seat])
    )
      continue;
    const used = new Set(old.cards.map((placement) => placement.card.id));
    for (const card of cards) {
      if (used.has(card.id)) continue;
      for (const side of [-1, 1]) {
        const value =
          side < 0 ? old.cards[0]!.value - 1 : old.cards[old.cards.length - 1]!.value + 1;
        if (value < 1 || value > (old.highAce ? 14 : 13)) continue;
        const meld: BiribaMeld = {
          ...old,
          cards: side < 0 ? [{ card, value }, ...old.cards] : [...old.cards, { card, value }],
        };
        if (biribaMeldValid(meld))
          result.push({ action: { type: "extend", index, meld }, meld, index, score: 0 });
      }
    }
  }
  return result;
}

function teamMeldsAfter(
  match: BiribaMatch,
  seat: number,
  meld: BiribaMeld,
  index?: number,
): BiribaMeld[] {
  const team = biribaTeamOf(seat, match.seats);
  return match.melds
    .map((old, position) => (position === index ? meld : old))
    .filter((old) => biribaTeamOf(old.ownerSeat, match.seats) === team)
    .concat(index === undefined ? [meld] : []);
}

function canLeaveHand(
  match: BiribaMatch,
  seat: number,
  remaining: number,
  meld: BiribaMeld,
  index?: number,
): boolean {
  const team = biribaTeamOf(seat, match.seats);
  const after = teamMeldsAfter(match, seat, meld, index);
  if (!match.packetTaken[team] && after.some((item) => item.cards.length >= 7))
    return remaining >= 0;
  const canClose =
    match.packetTaken[team] && biribaCanFinish(after, match.packetPlayed[team] ?? false, true);
  return remaining >= (canClose ? 1 : 2);
}

function meldScore(match: BiribaMatch, seat: number, meld: BiribaMeld, index?: number): number {
  const old = index === undefined ? undefined : match.melds[index];
  const priorIds = new Set(old?.cards.map((placement) => placement.card.id) ?? []);
  const additions = meld.cards.filter((placement) => !priorIds.has(placement.card.id));
  const beforeBonus = old ? biribaMeldBonus(old, match.trump) : 0;
  const bonusGain = biribaMeldBonus(meld, match.trump) - beforeBonus;
  const wildAdded = additions.some((placement) =>
    isWildPlacement(placement.card, meld.suit, placement.value),
  );
  const team = biribaTeamOf(seat, match.seats);
  const after = teamMeldsAfter(match, seat, meld, index);
  const packetOpportunity =
    !match.packetTaken[team] && after.some((item) => item.cards.length >= 7);
  const ownHand = match.hands[seat] ?? [];
  const spentFromHand = additions.filter((placement) =>
    ownHand.some((card) => card.id === placement.card.id),
  ).length;
  const emptyForPacket = packetOpportunity && spentFromHand === ownHand.length;
  return (
    additions.length * 10 +
    Math.max(-110, Math.min(160, bonusGain * 0.36)) +
    (meld.cards.length >= 7 && (old?.cards.length ?? 0) < 7 ? 70 : 0) +
    (emptyForPacket ? 95 : 0) +
    (meld.suit === match.trump ? 5 : 0) -
    (wildAdded ? (meld.cards.length < 7 ? 29 : 9) : 0) -
    (old && !biribaMeldDirty(old) && biribaMeldDirty(meld) ? 65 : 0)
  );
}

function bestMeld(match: BiribaMatch, seat: number, tier: 1 | 2 | 3): Candidate | null {
  if (match.forcedDiscardSeat === seat) return null;
  const hand = match.hands[seat] ?? [];
  const candidates: Candidate[] = [
    ...runs(hand, seat).map((meld): Candidate => ({
      action: { type: "meld", meld },
      meld,
      score: 0,
    })),
    ...extensions(match, seat, hand),
  ];
  const valid = candidates
    .filter((candidate) => {
      const oldIds = new Set(
        match.melds[candidate.index ?? -1]?.cards.map((placement) => placement.card.id) ?? [],
      );
      const spent = candidate.meld.cards.filter(
        (placement) => !oldIds.has(placement.card.id),
      ).length;
      return canLeaveHand(match, seat, hand.length - spent, candidate.meld, candidate.index);
    })
    .map((candidate) => ({
      ...candidate,
      score: meldScore(match, seat, candidate.meld, candidate.index),
    }))
    .sort((a, b) => b.score - a.score || b.meld.cards.length - a.meld.cards.length);
  const best = valid[0];
  if (!best) return null;
  const threshold = match.seats === 4 ? 22 : 31;
  return best.score >= threshold - (tier === 1 ? 5 : 0) - (hand.length >= 14 ? 8 : 0) ? best : null;
}

function pickupScore(
  match: BiribaMatch,
  seat: number,
  candidate: Candidate,
  pileIds: ReadonlySet<string>,
): number {
  const hand = match.hands[seat] ?? [];
  const pile = match.discards;
  const played = candidate.meld.cards.filter((placement) => pileIds.has(placement.card.id)).length;
  const useful = pile.filter((card) => {
    if (card.joker || card.rank === 2) return true;
    return hand.some(
      (held) => natural(held) && held.suit === card.suit && Math.abs(held.rank - card.rank) <= 2,
    );
  }).length;
  return candidate.score + played * 7 + useful * 5 - pile.length * 5;
}

function bestPickup(match: BiribaMatch, seat: number, tier: 1 | 2 | 3): Candidate | null {
  const pile = match.discards;
  if (!pile.length) return null;
  const hand = match.hands[seat] ?? [];
  const pileIds = new Set(pile.map((card) => card.id));
  const combined = [...hand, ...pile];
  const newMelds = runs(combined, seat, pileIds)
    .filter((meld) => meld.cards.some((placement) => pileIds.has(placement.card.id)))
    .map((meld): Candidate => ({
      action: { type: "pickup", ids: pile.map((card) => card.id), meld },
      meld,
      score: 0,
    }));
  const extended = extensions(match, seat, pile).map((candidate): Candidate => ({
    ...candidate,
    action: {
      type: "pickup",
      ids: pile.map((card) => card.id),
      index: candidate.index!,
      meld: candidate.meld,
    },
  }));
  const candidates = [...newMelds, ...extended]
    .filter((candidate) => {
      const oldIds = new Set(
        match.melds[candidate.index ?? -1]?.cards.map((placement) => placement.card.id) ?? [],
      );
      const spent = candidate.meld.cards.filter(
        (placement) => !oldIds.has(placement.card.id),
      ).length;
      return canLeaveHand(match, seat, combined.length - spent, candidate.meld, candidate.index);
    })
    .map((candidate) => ({
      ...candidate,
      score: pickupScore(
        match,
        seat,
        { ...candidate, score: meldScore(match, seat, candidate.meld, candidate.index) },
        pileIds,
      ),
    }))
    .sort((a, b) => b.score - a.score || b.meld.cards.length - a.meld.cards.length);
  const best = candidates[0];
  const threshold = tier === 3 ? 28 : tier === 2 ? 22 : 16;
  return best && (match.stock.length === 0 || best.score >= threshold) ? best : null;
}

function discardCost(match: BiribaMatch, seat: number, card: BiribaCard): number {
  if (card.joker) return 110;
  const hand = match.hands[seat] ?? [];
  const team = biribaTeamOf(seat, match.seats);
  let cost = card.rank === 2 ? 75 : -biribaCardPoints(card) * 0.35;
  if (card.suit === match.trump) cost += 4;
  for (const other of hand) {
    if (other.id === card.id || !natural(other) || other.suit !== card.suit) continue;
    const distance = Math.abs(other.rank - card.rank);
    if (distance === 1) cost += 19;
    else if (distance === 2) cost += 8;
  }
  for (const meld of match.melds) {
    if (meld.suit !== card.suit) continue;
    const value = cardValue(card, meld.highAce);
    const adjacent =
      value === meld.cards[0]!.value - 1 || value === meld.cards[meld.cards.length - 1]!.value + 1;
    if (!adjacent) continue;
    cost += biribaTeamOf(meld.ownerSeat, match.seats) === team ? 35 : 25;
  }
  return cost;
}

/** The bot sees its own hand and public discards/melds, never another hand or stock order. */
export function chooseBiribaBotAction(
  match: BiribaMatch,
  seat: number,
  tier: 1 | 2 | 3,
): BiribaAction | null {
  if (match.roundEnded || match.turn !== seat) return null;
  if (match.phase === "draw")
    return bestPickup(match, seat, tier)?.action ?? (match.stock.length ? { type: "draw" } : null);
  if (match.phase !== "meld") return null;
  const hand = match.hands[seat] ?? [];
  if (!hand.length) return null;
  const meld = bestMeld(match, seat, tier);
  if (meld) return meld.action;
  const card = [...hand].sort(
    (a, b) => discardCost(match, seat, a) - discardCost(match, seat, b) || a.id.localeCompare(b.id),
  )[0];
  return card ? { type: "discard", id: card.id } : null;
}

export function chooseBiribaBotStep(
  match: BiribaMatch,
  seat: number,
  tier: 1 | 2 | 3,
): BiribaMatch {
  const action = chooseBiribaBotAction(match, seat, tier);
  if (!action) return match;
  try {
    return biribaAction(match, seat, action);
  } catch {
    // Retain authoritative state if a future rule rejects a candidate.
    return match;
  }
}
