import {
  createDeck,
  RANK_VALUE,
  SUITS,
  type Card,
  type StandardCard,
  type Suit,
} from "@/domain/cards";
import {
  requestedSuitForTrick,
  type JokerSemantic,
  type PlayedCard,
  type PlayerView,
} from "@/domain/engine";
import type { BotStrategyProfileId } from "../../supabase/functions/_shared/bot-catalog";

export interface BotStrategy {
  id: BotStrategyProfileId;
  chooseDeclaration(view: PlayerView, legalValues: readonly number[]): number;
  chooseTrump(view: PlayerView, legalSuits: readonly (Suit | null)[]): Suit | null;
  chooseCard(view: PlayerView, legalMoves: readonly Card[]): Card;
  chooseJokerSemantic(view: PlayerView, options: readonly JokerSemantic[]): JokerSemantic;
}

export interface PublicInference {
  playedCardIds: ReadonlySet<string>;
  voidSuitsBySeat: ReadonlyMap<number, ReadonlySet<Suit>>;
}

export const DEFAULT_TIER3_SIMULATION_BUDGET = 96;
export const MAX_TIER3_SIMULATION_BUDGET = 192;

export const TIER1_DECLARATION_SIMULATION_BUDGET = 192;
export const TIER2_DECLARATION_SIMULATION_BUDGET = 640;
export const TIER3_DECLARATION_SIMULATION_BUDGET = 1_800;
export const MAX_DECLARATION_SIMULATION_BUDGET = 2_400;

type DeclarationTier = 1 | 2 | 3;

interface DeclarationSimulationConfig {
  tier: DeclarationTier;
  budget: number;
  declarationEvidenceWeight: number;
  uncertaintyPenalty: number;
}

export interface DeclarationAnalysis {
  probabilities: number[];
  expectedScores: ReadonlyMap<number, number>;
  selected: number;
}

function requireChoice<T>(values: readonly T[], label: string): T {
  const first = values[0];
  if (first === undefined) throw new Error(`Bot strategy received no legal ${label}`);
  return first;
}

function standardStrength(card: StandardCard, trump: Suit | null): number {
  const rank = RANK_VALUE[card.rank] + 1;
  return rank + (card.suit === trump ? 5 : 0);
}

function cardStrength(card: Card, trump: Suit | null): number {
  return card.kind === "joker" ? 20 : standardStrength(card, trump);
}

function remainingTricksNeeded(view: PlayerView): number {
  const declaration = view.declarations[view.seatIndex] ?? 0;
  return Math.max(0, declaration - (view.tricksTaken[view.seatIndex] ?? 0));
}

function chooseClosestLegal(legalValues: readonly number[], estimate: number): number {
  const first = requireChoice(legalValues, "declaration");
  return legalValues.reduce((best, value) => {
    const bestDistance = Math.abs(best - estimate);
    const distance = Math.abs(value - estimate);
    return distance < bestDistance || (distance === bestDistance && value < best) ? value : best;
  }, first);
}

function declarationEstimate(view: PlayerView): number {
  let estimate = 0;
  const suitCounts = new Map<Suit, number>();

  for (const card of view.hand) {
    if (card.kind === "joker") {
      estimate += 0.9;
      continue;
    }
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
    const rankWeight: Record<StandardCard["rank"], number> = {
      "6": 0.02,
      "7": 0.04,
      "8": 0.07,
      "9": 0.1,
      "10": 0.14,
      J: 0.22,
      Q: 0.36,
      K: 0.58,
      A: 0.86,
    };
    estimate += rankWeight[card.rank];
    if (card.suit === view.trump) estimate += 0.16;
  }

  if (view.trump) {
    const trumpLength = suitCounts.get(view.trump) ?? 0;
    if (trumpLength >= 3) estimate += (trumpLength - 2) * 0.18;
  }

  return Math.max(0, Math.min(view.cardsPerPlayer, Math.round(estimate)));
}


function declarationScore(view: PlayerView, declared: number, taken: number): number {
  if (view.scoringProfile === "minus" && taken < declared) {
    return -100 * (declared - taken);
  }
  if (declared === taken) {
    if (view.cardsPerPlayer > 0 && declared === view.cardsPerPlayer) {
      return 100 * view.cardsPerPlayer;
    }
    return 50 + 50 * declared;
  }
  if (taken === 0) return -200;
  return 10 * taken;
}

function handPotential(cards: readonly Card[], trump: Suit | null): number {
  const suitCounts = new Map<Suit, number>();
  let total = 0;
  for (const card of cards) {
    if (card.kind === "joker") {
      total += 0.96;
      continue;
    }
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
    const base: Record<StandardCard["rank"], number> = {
      "6": 0.03,
      "7": 0.05,
      "8": 0.08,
      "9": 0.12,
      "10": 0.18,
      J: 0.28,
      Q: 0.43,
      K: 0.65,
      A: 0.9,
    };
    total += base[card.rank] + (card.suit === trump ? 0.16 : 0);
  }
  if (trump) {
    const length = suitCounts.get(trump) ?? 0;
    if (length >= 3) total += (length - 2) * 0.16;
  }
  return total;
}

function splitSampledOpponentHands(
  view: PlayerView,
  sampled: readonly Card[],
): Map<number, Card[]> {
  const hands = new Map<number, Card[]>();
  let cursor = 0;
  for (let seat = 0; seat < 4; seat += 1) {
    if (seat === view.seatIndex) continue;
    hands.set(seat, sampled.slice(cursor, cursor + view.cardsPerPlayer));
    cursor += view.cardsPerPlayer;
  }
  return hands;
}

function sampleDeclarationEvidenceWeight(
  view: PlayerView,
  opponentHands: ReadonlyMap<number, readonly Card[]>,
  strength: number,
): number {
  if (strength <= 0) return 1;
  let logWeight = 0;
  for (let seat = 0; seat < 4; seat += 1) {
    if (seat === view.seatIndex) continue;
    const declared = view.declarations[seat];
    if (declared == null) continue;
    const sampledHand = opponentHands.get(seat) ?? [];
    const potential = handPotential(sampledHand, view.trump);
    const distance = Math.abs(potential - declared);
    logWeight -= strength * distance * distance * 0.55;
  }
  return Math.max(0.02, Math.exp(logWeight));
}

function sampledCardWinProbability(
  view: PlayerView,
  candidate: Card,
  opponentHands: ReadonlyMap<number, readonly Card[]>,
): number {
  const allOpponents = [...opponentHands.values()].flat();
  const opposingJokers = allOpponents.filter((card) => card.kind === "joker").length;
  if (candidate.kind === "joker") {
    return opposingJokers === 0 ? 0.97 : opposingJokers === 1 ? 0.76 : 0.62;
  }

  const rankFraction = (RANK_VALUE[candidate.rank] + 1) / 9;
  const ownSuitLength = view.hand.filter(
    (card) => card.kind === "standard" && card.suit === candidate.suit,
  ).length;
  const higherSameSuit = allOpponents.filter(
    (card): card is StandardCard =>
      card.kind === "standard" &&
      card.suit === candidate.suit &&
      RANK_VALUE[card.rank] > RANK_VALUE[candidate.rank],
  ).length;

  let probability = 0.05 + 0.84 * Math.pow(rankFraction, 1.65);
  probability += Math.max(0, ownSuitLength - 1) * 0.025;

  if (candidate.suit === view.trump) {
    probability += 0.12;
    probability /= 1 + higherSameSuit * 0.5 + opposingJokers * 0.7;
  } else {
    probability /= 1 + higherSameSuit * 0.38 + opposingJokers * 0.62;
    if (view.trump) {
      let likelyCutters = 0;
      for (const hand of opponentHands.values()) {
        const hasSuit = hand.some(
          (card) => card.kind === "standard" && card.suit === candidate.suit,
        );
        const canCut = hand.some(
          (card) =>
            card.kind === "joker" ||
            (card.kind === "standard" && card.suit === view.trump),
        );
        if (!hasSuit && canCut) likelyCutters += 1;
      }
      probability *= Math.max(0.18, 1 - likelyCutters * 0.23);
    }
  }

  return Math.max(0.02, Math.min(0.985, probability));
}

function declarationConfig(tier: DeclarationTier, requestedBudget?: number): DeclarationSimulationConfig {
  const defaults = {
    1: TIER1_DECLARATION_SIMULATION_BUDGET,
    2: TIER2_DECLARATION_SIMULATION_BUDGET,
    3: TIER3_DECLARATION_SIMULATION_BUDGET,
  } as const;
  const rawBudget = requestedBudget ?? defaults[tier];
  const budget = Number.isFinite(rawBudget)
    ? Math.max(0, Math.min(MAX_DECLARATION_SIMULATION_BUDGET, Math.floor(rawBudget)))
    : defaults[tier];
  return {
    tier,
    budget,
    declarationEvidenceWeight: tier === 1 ? 0.2 : tier === 2 ? 0.62 : 1.05,
    uncertaintyPenalty: tier === 1 ? 10 : tier === 2 ? 5 : 1.5,
  };
}

export function analyzeDeclaration(
  view: PlayerView,
  legalValues: readonly number[],
  tier: DeclarationTier,
  options: { seed?: string; budget?: number } = {},
): DeclarationAnalysis {
  const first = requireChoice(legalValues, "declaration");
  if (legalValues.length === 1) {
    return {
      probabilities: Array.from({ length: view.cardsPerPlayer + 1 }, (_, index) =>
        index === first ? 1 : 0,
      ),
      expectedScores: new Map([[first, declarationScore(view, first, first)]]),
      selected: first,
    };
  }

  const config = declarationConfig(tier, options.budget);
  if (config.budget === 0) {
    const selected = chooseClosestLegal(legalValues, declarationEstimate(view));
    return {
      probabilities: Array.from({ length: view.cardsPerPlayer + 1 }, (_, index) =>
        index === selected ? 1 : 0,
      ),
      expectedScores: new Map(legalValues.map((value) => [value, declarationScore(view, value, selected)])),
      selected,
    };
  }

  const inference = derivePublicInference(view);
  const unknown = fairUnknownCards(view, inference);
  const opponentCardCount = Math.min(unknown.length, view.cardsPerPlayer * 3);
  const random = seededRandom(
    `${options.seed ?? "declaration"}|${tier}|${viewSeed(view)}|${legalValues.join(",")}`,
  );
  const weightedOutcomes = Array.from({ length: view.cardsPerPlayer + 1 }, () => 0);
  let totalWeight = 0;

  for (let iteration = 0; iteration < config.budget; iteration += 1) {
    const sampled = sampleWithoutReplacement(unknown, opponentCardCount, random);
    const opponentHands = splitSampledOpponentHands(view, sampled);
    const weight = sampleDeclarationEvidenceWeight(
      view,
      opponentHands,
      config.declarationEvidenceWeight,
    );
    let taken = 0;
    for (const card of view.hand) {
      const probability = sampledCardWinProbability(view, card, opponentHands);
      if (random() < probability) taken += 1;
    }
    taken = Math.max(0, Math.min(view.cardsPerPlayer, taken));
    weightedOutcomes[taken] = (weightedOutcomes[taken] ?? 0) + weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) {
    const selected = chooseClosestLegal(legalValues, declarationEstimate(view));
    return {
      probabilities: weightedOutcomes,
      expectedScores: new Map(legalValues.map((value) => [value, 0])),
      selected,
    };
  }

  const probabilities = weightedOutcomes.map((weight) => weight / totalWeight);
  const expectedScores = new Map<number, number>();
  let selected = first;
  let bestUtility = Number.NEGATIVE_INFINITY;

  for (const declared of legalValues) {
    let expected = 0;
    let catastrophic = 0;
    for (let taken = 0; taken < probabilities.length; taken += 1) {
      const probability = probabilities[taken] ?? 0;
      expected += probability * declarationScore(view, declared, taken);
      if (declared > 0 && taken === 0) catastrophic += probability;
    }
    expectedScores.set(declared, expected);
    const utility = expected - catastrophic * config.uncertaintyPenalty;
    if (utility > bestUtility || (utility === bestUtility && declared < selected)) {
      selected = declared;
      bestUtility = utility;
    }
  }

  return { probabilities, expectedScores, selected };
}

function suitQuality(view: PlayerView, suit: Suit): number {
  const suited = view.hand.filter(
    (card): card is StandardCard => card.kind === "standard" && card.suit === suit,
  );
  return suited.reduce((sum, card) => sum + RANK_VALUE[card.rank] + 1, 0) + suited.length * 2.25;
}

function noTrumpQuality(view: PlayerView): number {
  let highCards = 0;
  let jokers = 0;
  for (const card of view.hand) {
    if (card.kind === "joker") jokers += 1;
    else if (RANK_VALUE[card.rank] >= RANK_VALUE.Q) highCards += 1;
  }
  return highCards * 3 + jokers * 5;
}

function chooseStrongBasicTrump(view: PlayerView, legalSuits: readonly (Suit | null)[]): Suit | null {
  const first = requireChoice(legalSuits, "trump choice");
  return legalSuits.reduce((best, candidate) => {
    const score = candidate === null ? noTrumpQuality(view) : suitQuality(view, candidate);
    const bestScore = best === null ? noTrumpQuality(view) : suitQuality(view, best);
    return score > bestScore ? candidate : best;
  }, first);
}

function chooseByStrength(
  view: PlayerView,
  legalMoves: readonly Card[],
  preferWinning: boolean,
): Card {
  const first = requireChoice(legalMoves, "card");
  return legalMoves.reduce((best, card) => {
    const delta = cardStrength(card, view.trump) - cardStrength(best, view.trump);
    if (delta === 0) return card.id < best.id ? card : best;
    return preferWinning ? (delta > 0 ? card : best) : delta < 0 ? card : best;
  }, first);
}

function chooseBasicJokerSemantic(
  view: PlayerView,
  options: readonly JokerSemantic[],
): JokerSemantic {
  const first = requireChoice(options, "Joker semantic");
  const needWin = remainingTricksNeeded(view) > 0;

  if (first.context === "OPEN_TRICK") {
    const targetMode = needWin ? "COMPETE" : "FROM_BELOW";
    return options.find(
      (option) => option.context === "OPEN_TRICK" && option.mode === targetMode,
    ) ?? first;
  }

  const targetMode = needWin ? "HIGHER_SUIT" : "SUIT_WINS";
  const sameMode = options.filter(
    (option): option is Extract<JokerSemantic, { context: "LEAD" }> =>
      option.context === "LEAD" && option.mode === targetMode,
  );
  if (sameMode.length === 0) return first;

  const bestTrump = chooseStrongBasicTrump(
    view,
    sameMode.map((option) => option.requestedSuit),
  );
  return sameMode.find((option) => option.requestedSuit === bestTrump) ?? sameMode[0]!;
}

export function derivePublicInference(view: PlayerView): PublicInference {
  const playedCardIds = new Set<string>();
  const mutableVoids = new Map<number, Set<Suit>>();

  const observeTrick = (plays: readonly PlayedCard[]) => {
    for (const play of plays) playedCardIds.add(play.card.id);
    const requestedSuit = requestedSuitForTrick(plays);
    if (!requestedSuit) return;

    for (let index = 1; index < plays.length; index += 1) {
      const play = plays[index]!;
      if (play.card.kind === "joker") continue;
      if (play.card.suit === requestedSuit) continue;
      const voids = mutableVoids.get(play.seatIndex) ?? new Set<Suit>();
      voids.add(requestedSuit);
      mutableVoids.set(play.seatIndex, voids);
    }
  };

  if (view.deckProfile === "classic38" && view.exposedTrumpCard) playedCardIds.add(view.exposedTrumpCard.id);
  for (const trick of view.history.completedTricks) observeTrick(trick.cards);
  observeTrick(view.currentTrick);

  return {
    playedCardIds,
    voidSuitsBySeat: new Map(
      [...mutableVoids.entries()].map(([seat, suits]) => [seat, new Set(suits)] as const),
    ),
  };
}

function publicRiskPenalty(view: PlayerView, card: Card, inference: PublicInference): number {
  if (card.kind !== "standard" || !view.trump || card.suit === view.trump) return 0;
  let penalty = 0;
  for (let seat = 0; seat < 4; seat += 1) {
    if (seat === view.seatIndex) continue;
    if (inference.voidSuitsBySeat.get(seat)?.has(card.suit)) penalty += 3;
  }
  return penalty;
}

function unseenHigherCount(view: PlayerView, card: Card, inference: PublicInference): number {
  if (card.kind !== "standard") return 0;
  const ownIds = new Set(view.hand.map((item) => item.id));
  return createDeck(view.deckProfile).filter(
    (candidate) =>
      candidate.kind === "standard" &&
      candidate.suit === card.suit &&
      RANK_VALUE[candidate.rank] > RANK_VALUE[card.rank] &&
      !ownIds.has(candidate.id) &&
      !inference.playedCardIds.has(candidate.id),
  ).length;
}

function chooseMemoryCard(view: PlayerView, legalMoves: readonly Card[]): Card {
  const first = requireChoice(legalMoves, "card");
  const inference = derivePublicInference(view);
  const needWin = remainingTricksNeeded(view) > 0;

  return legalMoves.reduce((best, card) => {
    const score =
      cardStrength(card, view.trump) -
      publicRiskPenalty(view, card, inference) -
      unseenHigherCount(view, card, inference) * 0.7;
    const bestScore =
      cardStrength(best, view.trump) -
      publicRiskPenalty(view, best, inference) -
      unseenHigherCount(view, best, inference) * 0.7;

    if (score === bestScore) return card.id < best.id ? card : best;
    return needWin ? (score > bestScore ? card : best) : score < bestScore ? card : best;
  }, first);
}

function stableHash32(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = stableHash32(seed) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

export function fairUnknownCards(view: PlayerView, inference: PublicInference): Card[] {
  const known = new Set<string>(view.hand.map((card) => card.id));
  for (const id of inference.playedCardIds) known.add(id);
  return createDeck(view.deckProfile).filter((card) => !known.has(card.id));
}

function sampleWithoutReplacement(cards: readonly Card[], count: number, random: () => number): Card[] {
  const pool = cards.slice();
  const result: Card[] = [];
  const limit = Math.min(count, pool.length);
  for (let index = 0; index < limit; index += 1) {
    const selected = Math.floor(random() * pool.length);
    result.push(pool[selected]!);
    pool.splice(selected, 1);
  }
  return result;
}

function sampledThreat(view: PlayerView, candidate: Card, sampled: readonly Card[]): boolean {
  if (candidate.kind === "joker") return false;
  const requested = requestedSuitForTrick(view.currentTrick) ?? candidate.suit;

  return sampled.some((card) => {
    if (card.kind === "joker") return true;
    if (view.trump && candidate.suit !== view.trump && card.suit === view.trump) return true;
    if (card.suit !== candidate.suit && candidate.suit === requested) return false;
    return card.suit === candidate.suit && RANK_VALUE[card.rank] > RANK_VALUE[candidate.rank];
  });
}

function viewSeed(view: PlayerView): string {
  const history = view.history.completedTricks
    .flatMap((trick) => trick.cards.map((play) => `${play.seatIndex}:${play.card.id}`))
    .join(",");
  return [
    view.seatIndex,
    view.trump ?? "none",
    view.hand.map((card) => card.id).sort().join(","),
    view.declarations.join(","),
    view.tricksTaken.join(","),
    view.currentTrick.map((play) => `${play.seatIndex}:${play.card.id}`).join(","),
    history,
  ].join("|");
}

export interface Tier3StrategyOptions {
  seed?: string;
  simulationBudget?: number;
  declarationSimulationBudget?: number;
}

export function createProbabilitySimulationStrategy(
  options: Tier3StrategyOptions = {},
): BotStrategy {
  const requestedBudget = options.simulationBudget ?? DEFAULT_TIER3_SIMULATION_BUDGET;
  const simulationBudget = Number.isFinite(requestedBudget)
    ? Math.max(0, Math.min(MAX_TIER3_SIMULATION_BUDGET, Math.floor(requestedBudget)))
    : DEFAULT_TIER3_SIMULATION_BUDGET;
  const baseSeed = options.seed ?? "production";

  return {
    id: "probability-simulation-v1",
    chooseDeclaration(view, legalValues) {
      return analyzeDeclaration(
        view,
        legalValues,
        3,
        options.declarationSimulationBudget == null
          ? { seed: `${baseSeed}|tier3-declaration` }
          : {
              seed: `${baseSeed}|tier3-declaration`,
              budget: options.declarationSimulationBudget,
            },
      ).selected;
    },
    chooseTrump: chooseStrongBasicTrump,
    chooseCard(view, legalMoves) {
      const fallback = chooseMemoryCard(view, legalMoves);
      if (simulationBudget === 0 || legalMoves.length <= 1) return fallback;

      const inference = derivePublicInference(view);
      const unknown = fairUnknownCards(view, inference);
      if (unknown.length === 0) return fallback;

      const needWin = remainingTricksNeeded(view) > 0;
      const iterationsPerCandidate = Math.max(1, Math.floor(simulationBudget / legalMoves.length));
      let best = fallback;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const candidate of legalMoves) {
        const random = seededRandom(`${baseSeed}|${viewSeed(view)}|${candidate.id}`);
        let safeSamples = 0;
        for (let iteration = 0; iteration < iterationsPerCandidate; iteration += 1) {
          const sampled = sampleWithoutReplacement(unknown, 3, random);
          if (!sampledThreat(view, candidate, sampled)) safeSamples += 1;
        }
        const winProbability = safeSamples / iterationsPerCandidate;
        const conservation = 1 - cardStrength(candidate, view.trump) / 20;
        const score = needWin ? winProbability * 4 + conservation : (1 - winProbability) * 3 + conservation;
        if (score > bestScore || (score === bestScore && candidate.id < best.id)) {
          best = candidate;
          bestScore = score;
        }
      }
      return best;
    },
    chooseJokerSemantic: chooseBasicJokerSemantic,
  };
}

export const strongBasicStrategy: BotStrategy = {
  id: "strong-basic-v1",
  chooseDeclaration(view, legalValues) {
    return analyzeDeclaration(view, legalValues, 1, { seed: "tier1-declaration" }).selected;
  },
  chooseTrump: chooseStrongBasicTrump,
  chooseCard(view, legalMoves) {
    return chooseByStrength(view, legalMoves, remainingTricksNeeded(view) > 0);
  },
  chooseJokerSemantic: chooseBasicJokerSemantic,
};

export const memoryInferenceStrategy: BotStrategy = {
  id: "memory-inference-v1",
  chooseDeclaration(view, legalValues) {
    return analyzeDeclaration(view, legalValues, 2, { seed: "tier2-declaration" }).selected;
  },
  chooseTrump: chooseStrongBasicTrump,
  chooseCard: chooseMemoryCard,
  chooseJokerSemantic: chooseBasicJokerSemantic,
};

export const probabilitySimulationStrategy = createProbabilitySimulationStrategy();

const STRATEGIES: Record<BotStrategyProfileId, BotStrategy> = {
  "strong-basic-v1": strongBasicStrategy,
  "memory-inference-v1": memoryInferenceStrategy,
  "probability-simulation-v1": probabilitySimulationStrategy,
};

export function resolveBotStrategy(profileId: BotStrategyProfileId): BotStrategy {
  return STRATEGIES[profileId];
}

// Keep suit ordering canonical for deterministic strategy tie-breaking/tests.
void SUITS;
