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
  type BiribaRank,
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
        const promoteAce =
          side > 0 &&
          value === 14 &&
          !old.highAce &&
          !old.cards.some((p) => p.value === 1) &&
          !card.joker &&
          card.rank === 1;
        if (value < 1 || value > (old.highAce || promoteAce ? 14 : 13)) continue;
        const meld: BiribaMeld = {
          ...old,
          highAce: old.highAce || promoteAce,
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

/**
 * Evaluate natural clean-run plans that are not playable yet.
 * The bot deliberately values holding cards that are one or two natural
 * draws away from a clean biriba instead of spending a wildcard immediately.
 */
function cleanRunPlans(match: BiribaMatch, seat: number): Array<{ ids: string[]; missing: number; probability: number; length: number }> {
  const hand = match.hands[seat] ?? [];
  const publicCards = [
    ...match.discards,
    ...match.melds.flatMap((meld) => meld.cards.map((placement) => placement.card)),
  ];
  const known = new Set([...hand, ...publicCards].map((card) => card.id));
  const deck = Array.from({ length: 2 }, (_, copy) =>
    BIRIBA_SUITS.flatMap((suit) =>
      Array.from({ length: 13 }, (_, index) => ({
        id: `biriba-${copy}-${suit}-${index + 1}`,
        suit,
        rank: index + 1,
      })),
    ),
  ).flat();
  const remainingByKey = new Map<string, number>();
  for (const card of deck) {
    const key = `${card.suit}:${card.rank}`;
    if (!known.has(card.id)) remainingByKey.set(key, (remainingByKey.get(key) ?? 0) + 1);
  }
  const unknownCount = Math.max(1, 108 - known.size);
  const plans: Array<{ ids: string[]; missing: number; probability: number; length: number }> = [];
  for (const suit of BIRIBA_SUITS) {
    for (const highAce of [false, true]) {
      const min = highAce ? 3 : 1;
      const max = highAce ? 14 : 13;
      const valueOf = (card: BiribaCard) => card.rank === 1 && highAce ? 14 : card.rank;
      for (let first = min; first <= max - 3; first++) {
        for (let last = first + 3; last <= Math.min(max, first + 7); last++) {
          const held = hand.filter((card) => natural(card) && card.suit === suit &&
            valueOf(card) >= first && valueOf(card) <= last);
          if (held.length < 2) continue;
          const values = new Set(held.map(valueOf));
          let missing = 0;
          let available = 0;
          for (let value = first; value <= last; value++) {
            if (values.has(value)) continue;
            missing++;
            const rank = value === 14 ? 1 : value;
            available += remainingByKey.get(`${suit}:${rank}`) ?? 0;
          }
          if (missing < 1 || missing > 2 || available < missing) continue;
          const draws = Math.min(6, Math.max(1, Math.ceil(match.stock.length / Math.max(1, match.seats))));
          const probability = 1 - Math.pow(1 - available / unknownCount, draws);
          plans.push({ ids: held.map((card) => card.id), missing, probability, length: last - first + 1 });
        }
      }
    }
  }
  return plans.sort((a, b) => b.probability * b.length - a.probability * a.length);
}

function cleanPlanHoldValue(match: BiribaMatch, seat: number, card: BiribaCard, tier: 1 | 2 | 3): number {
  if (!natural(card)) return 0;
  const best = cleanRunPlans(match, seat)
    .filter((plan) => plan.ids.includes(card.id))
    .reduce((score, plan) => Math.max(score,
      plan.probability * (plan.length * 5 + 18) * (plan.missing === 1 ? 1.35 : 1)), 0);
  return best * (tier === 3 ? 1 : tier === 2 ? 0.78 : 0.55);
}

function meldScore(match: BiribaMatch, seat: number, meld: BiribaMeld, index?: number): number {
  const old = index === undefined ? undefined : match.melds[index];
  const priorIds = new Set(old?.cards.map((placement) => placement.card.id) ?? []);
  const additions = meld.cards.filter((placement) => !priorIds.has(placement.card.id));
  const beforeBonus = old ? biribaMeldBonus(old, match.trump) : 0;
  const bonusGain = biribaMeldBonus(meld, match.trump) - beforeBonus;
  // A new three-card run used to outscore a natural one-card extension (30 vs 10),
  // even when both moves used the same sequence and the extension advanced a
  // teammate's unfinished clean biriba. Reward that shared progress explicitly.
  const cleanBiribaProgress =
    old && old.cards.length < 7 && !biribaMeldDirty(old) && !biribaMeldDirty(meld) ? 24 : 0;
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
    cleanBiribaProgress +
    Math.max(-110, Math.min(160, bonusGain * 0.36)) +
    (meld.cards.length >= 7 && (old?.cards.length ?? 0) < 7 ? 70 : 0) +
    (emptyForPacket ? 95 : 0) +
    (meld.suit === match.trump ? 5 : 0) -
    (wildAdded ? (meld.cards.length < 7 ? 92 : 58) : 0) -
    (old && !biribaMeldDirty(old) && biribaMeldDirty(meld) ? 105 : 0)
  );
}

/**
 * Bounded Monte-Carlo evaluation for strategic decisions.
 * Unknown cards are sampled from the unseen 108-card pack; opponent hands and
 * stock order are never read. Samples are deterministic for a given public state.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function publicUnseenPool(match: BiribaMatch, seat: number): BiribaCard[] {
  const known = new Set<string>();
  for (const card of match.hands[seat] ?? []) known.add(card.id);
  for (const card of match.discards) known.add(card.id);
  for (const meld of match.melds) for (const p of meld.cards) known.add(p.card.id);
  const deck: BiribaCard[] = Array.from({ length: 2 }, (_, copy) =>
    BIRIBA_SUITS.flatMap((suit) =>
      Array.from({ length: 13 }, (_, index) => ({
        id: `biriba-${copy}-${suit}-${index + 1}`,
        suit,
        rank: (index + 1) as BiribaRank,
      } as BiribaCard)),
    ),
  ).flat();
  for (let j = 0; j < 4; j++) deck.push({ id: `biriba-joker-${j}`, joker: true });
  return deck.filter((card) => !known.has(card.id));
}

function cleanPotential(cards: readonly BiribaCard[], _seat: number): number {
  let best = 0;
  for (const suit of BIRIBA_SUITS) {
    for (const highAce of [false, true]) {
      const values = new Set(cards
        .filter((card): card is Extract<BiribaCard, { joker?: false }> =>
          !card.joker && card.suit === suit)
        .map((card) => card.rank === 1 && highAce ? 14 : card.rank)
        .filter((value) => highAce ? value >= 3 : value <= 13));
      let run = 0;
      let previous = -2;
      for (const value of [...values].sort((a, b) => a - b)) {
        run = value === previous + 1 ? run + 1 : 1;
        previous = value;
        if (run >= 3) best = Math.max(best, run >= 7 ? 90 + run * 7 : run * 5);
      }
    }
  }
  return best;
}

function monteCarloPlanValue(match: BiribaMatch, seat: number, candidate: Candidate, tier: 1 | 2 | 3): number {
  if (tier === 1) return 0;
  const pool = publicUnseenPool(match, seat);
  if (pool.length < 4) return 0;
  const samples = tier === 3 ? 4 : 2;
  const draws = Math.min(tier === 3 ? 5 : 3, Math.max(1, Math.ceil(match.stock.length / Math.max(1, match.seats))));
  const seedText = [...(match.hands[seat] ?? []).map((c) => c.id), ...candidate.meld.cards.map((p) => p.card.id)].sort().join("|");
  const seed = [...seedText].reduce((value, char) => Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const random = seededRandom(seed);
  const scores: number[] = [];
  for (let sample = 0; sample < samples; sample++) {
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const future = [...(match.hands[seat] ?? [])];
    const spentIds = new Set(candidate.meld.cards.map((p) => p.card.id));
    const nextHand = future.filter((card) => !spentIds.has(card.id));
    const stockOffset = Math.max(0, shuffled.length - match.stock.length);
    nextHand.push(...shuffled.slice(stockOffset, stockOffset + draws));
    // Estimate natural clean-run completion potential after plausible draws.
    const potential = cleanPotential(nextHand, seat);
    const remainingWilds = nextHand.filter((card) => card.joker || (card.rank === 2 && card.suit !== candidate.meld.suit)).length;
    scores.push(potential - remainingWilds * 2);
  }
  scores.sort((a, b) => a - b);
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const lowerQuartile = scores[Math.floor(scores.length * 0.25)] ?? mean;
  // Risk-adjusted value: reward repeatable plans, not just lucky samples.
  return (mean * 0.65 + lowerQuartile * 0.35) * (tier === 3 ? 0.42 : 0.25);
}

function opponentThreatPenalty(match: BiribaMatch, seat: number, meld: BiribaMeld): number {
  const ownTeam = biribaTeamOf(seat, match.seats);
  const opponentTeams = [...new Set(
    Array.from({ length: match.seats }, (_, index) => biribaTeamOf(index, match.seats))
      .filter((team) => team !== ownTeam),
  )];
  const exposed = opponentTeams.reduce((sum, opponentTeam) => {
    const teamMelds = match.melds.filter((item) => biribaTeamOf(item.ownerSeat, match.seats) === opponentTeam);
    return sum + teamMelds.reduce((value, item) => value + (item.cards.length >= 6 ? 12 : item.cards.length >= 4 ? 6 : 0), 0);
  }, 0);
  const opponentHasPacket = opponentTeams.some((team) => match.packetTaken[team]);
  const nearingClose = opponentTeams.some((team) => match.packetTaken[team] && match.packetPlayed[team]);
  const dirtyPenalty = biribaMeldDirty(meld) ? 0 : -Math.min(10, exposed * 0.12);
  return dirtyPenalty + (opponentHasPacket ? -5 : 0) + (nearingClose ? -12 : 0);
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
  const ranked = candidates
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
      score: meldScore(match, seat, candidate.meld, candidate.index) +
        opponentThreatPenalty(match, seat, candidate.meld),
    }))
    .sort((a, b) => b.score - a.score || b.meld.cards.length - a.meld.cards.length)
    .slice(0, tier === 3 ? 2 : tier === 2 ? 1 : 1);
  const valid = ranked
    .map((candidate) => ({
      ...candidate,
      score: candidate.score + monteCarloPlanValue(match, seat, candidate, tier),
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
        { ...candidate, score: meldScore(match, seat, candidate.meld, candidate.index) +
          opponentThreatPenalty(match, seat, candidate.meld) },
        pileIds,
      ),
    }))
    .sort((a, b) => b.score - a.score || b.meld.cards.length - a.meld.cards.length)
    .slice(0, tier === 3 ? 6 : tier === 2 ? 4 : 1)
    .map((candidate) => ({
      ...candidate,
      score: candidate.score + monteCarloPlanValue(match, seat, candidate, tier),
    }))
    .sort((a, b) => b.score - a.score || b.meld.cards.length - a.meld.cards.length);
  const best = candidates[0];
  const threshold = tier === 3 ? 28 : tier === 2 ? 22 : 16;
  return best && (match.stock.length === 0 || best.score >= threshold) ? best : null;
}

function discardCost(match: BiribaMatch, seat: number, card: BiribaCard, tier: 1 | 2 | 3): number {
  if (card.joker) return 110;
  const hand = match.hands[seat] ?? [];
  const team = biribaTeamOf(seat, match.seats);
  let cost = card.rank === 2 ? 75 : -biribaCardPoints(card) * 0.35;
  if (card.suit === match.trump) cost += 4;
  // Retain natural cards that are part of a credible future clean-biriba plan.
  cost += cleanPlanHoldValue(match, seat, card, tier);
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
    (a, b) => discardCost(match, seat, a, tier) - discardCost(match, seat, b, tier) || a.id.localeCompare(b.id),
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
