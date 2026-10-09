import { RANK_VALUE, SUITS, type Card, type Suit } from "@/domain/cards";
import { legalCards, requestedSuitForTrick, resolveTrick, type PlayedCard } from "@/domain/engine";
import { declarationOrder, legalDeclarationValues, type Declarations } from "@/domain/declarations";
import { DEALS, dealsOfPhase } from "@/domain/gameConfig";
import { getRuleset } from "@/domain/rulesets";
import { rankFinalScores } from "@/domain/ranking";
import type { SeatIndex } from "@/domain/dealing";
import type { GameplayCommand } from "@/domain/gameplayCommands";
import type { PlayerGameProjection } from "@/domain/projection";
import {
  observeBot,
  sampleConsistentWorld,
  type BotObservation,
  type HypotheticalWorld,
} from "./observation";

export const COMPETITIVE_VERSION = "competitive-v2";
export type CompetitiveTier = 1 | 2 | 3;
export const TIER_BUDGETS = {
  1: { worlds: 6, transitions: 18000 },
  2: { worlds: 16, transitions: 42000 },
  3: { worlds: 32, transitions: 90000 },
} as const;
export interface SearchReport {
  command: GameplayCommand;
  worlds: number;
  transitions: number;
  exhausted: boolean;
  sampleFailures: number;
  failure: string | null;
  candidates: Array<{ key: string; meanUtility: number; exactRate: number }>;
  plan: { bidState: string; threatenedSeats: number[]; revision: number; style: string };
}
interface Budget {
  used: number;
  limit: number;
  cancelled: () => boolean;
  expired: () => boolean;
}
function spend(b: Budget) {
  if (++b.used > b.limit || b.cancelled() || b.expired()) throw new Error("SEARCH_BUDGET");
}
export function strategicRandom(seed: string): () => number {
  let v = 2166136261;
  for (const c of seed) v = Math.imul(v ^ c.charCodeAt(0), 16777619);
  return () => {
    v = (Math.imul(v, 1664525) + 1013904223) >>> 0;
    return v / 4294967296;
  };
}
function semanticForSeed(play: PlayedCard) {
  const j = play.joker;
  return !j
    ? null
    : j.context === "LEAD"
      ? { context: j.context, mode: j.mode, requestedSuit: j.requestedSuit }
      : { context: j.context, mode: j.mode };
}
/** Rebuild the original canonical field order. JSONB object-key order is not
 * game information and must not change a reproducible policy seed. */
function playsForSeed(plays: readonly PlayedCard[]) {
  return plays.map((p) => ({
    seatIndex: p.seatIndex,
    card:
      p.card.kind === "joker"
        ? { kind: p.card.kind, id: p.card.id }
        : { kind: p.card.kind, id: p.card.id, suit: p.card.suit, rank: p.card.rank },
    ...(p.joker ? { joker: semanticForSeed(p) } : {}),
  }));
}
function key(play: PlayedCard): string {
  return play.card.id + "/" + JSON.stringify(semanticForSeed(play));
}
export function completeActions(
  hand: readonly Card[],
  trick: readonly PlayedCard[],
  trump: Suit | null,
  seat: number,
): PlayedCard[] {
  const lead = trick[0];
  const legal = legalCards({
    hand,
    requestedSuit: requestedSuitForTrick(trick),
    trump,
    requireHighestRequested: lead?.joker?.context === "LEAD" && lead.joker.mode === "HIGHER_SUIT",
  });
  return legal.flatMap((card): PlayedCard[] =>
    card.kind !== "joker"
      ? [{ seatIndex: seat, card }]
      : trick.length
        ? ["COMPETE", "FROM_BELOW"].map((mode) => ({
            seatIndex: seat,
            card,
            joker: { context: "OPEN_TRICK", mode: mode as "COMPETE" | "FROM_BELOW" },
          }))
        : SUITS.flatMap((requestedSuit) =>
            ["HIGHER_SUIT", "SUIT_WINS"].map((mode) => ({
              seatIndex: seat,
              card,
              joker: { context: "LEAD", mode: mode as "HIGHER_SUIT" | "SUIT_WINS", requestedSuit },
            })),
          ),
  );
}
function strength(card: Card, trump: Suit | null): number {
  return card.kind === "joker"
    ? 14
    : (RANK_VALUE[card.rank] + 1) / 9 + (card.suit === trump ? 1 : 0);
}
function potential(hand: readonly Card[], trump: Suit | null): number {
  return hand.reduce(
    (sum, c) =>
      sum +
      (c.kind === "joker"
        ? 0.85
        : Math.pow((RANK_VALUE[c.rank] + 1) / 9, 3) * (c.suit === trump ? 1.2 : 0.75)),
    0,
  );
}

/** Prediction only, never a winner of record. A complete trick always uses
 * resolveTrick. Early prefixes have no authoritative winner yet. */
function apparentWinner(trick: PlayedCard[], trump: Suit | null): number {
  if (trick.length === 4) return resolveTrick({ plays: trick, trump }).winnerSeat;
  const lead = trick[0]!;
  const request = requestedSuitForTrick(trick);
  const competing = trick.filter((p) => p.joker?.mode === "COMPETE").at(-1);
  if (competing) return competing.seatIndex;
  const trumps = trump
    ? trick.filter((p) => p.card.kind === "standard" && p.card.suit === trump)
    : [];
  if (lead.joker?.mode === "HIGHER_SUIT" && (request === trump || !trumps.length))
    return lead.seatIndex;
  const eligible = trumps.length
    ? trumps
    : trick.filter((p) => p.card.kind === "standard" && p.card.suit === request);
  return (
    eligible.reduce<PlayedCard | null>(
      (best, p) => (!best || strength(p.card, trump) > strength(best.card, trump) ? p : best),
      null,
    )?.seatIndex ?? lead.seatIndex
  );
}

/** Rollout policy accepts its own hand and public state only. Never hands[] or
 * stock. Identical actor observations produce identical decisions across worlds. */
export function rolloutPolicy(args: {
  hand: Card[];
  trick: PlayedCard[];
  trump: Suit | null;
  seat: number;
  bid: number;
  taken: number;
  remaining: number;
  scenario: number;
}): PlayedCard {
  const { hand, trick, trump, seat, bid, taken, remaining, scenario } = args;
  const choices = completeActions(hand, trick, trump, seat);
  if (!choices.length) throw new Error("No rollout action");
  const need = bid - taken;
  const seek = need > 0 || taken > bid || need > remaining;
  let best = choices[0]!,
    value = -Infinity;
  for (const action of choices) {
    const win = apparentWinner([...trick, action], trump) === seat;
    const resource = strength(action.card, trump);
    // Winner conservation / dangerous high losers / forced-lead trap exits.
    const score =
      (win === seek ? 8 : 0) +
      (seek ? -resource : resource) * 0.2 +
      (action.joker?.mode === "HIGHER_SUIT" && action.joker.requestedSuit === trump ? 0.4 : 0) +
      (need === remaining && win ? 2 : 0) +
      (scenario === 1 && seek && action.card.kind === "standard" ? 0.15 * resource : 0) +
      (scenario === 2 && !seek && action.joker?.mode === "FROM_BELOW" ? 0.2 : 0);
    if (score > value || (score === value && key(action) < key(best))) {
      value = score;
      best = action;
    }
  }
  return best;
}

/** Exact current-deal score and exact premia at round closure. Before closure
 * future outcomes are sampled, never passed incomplete to resolvePremia. The
 * early-game rank margin is explicitly a surrogate, not a win probability. */
export function outcomeUtility(
  o: BotObservation,
  bids: number[],
  taken: number[],
  random: () => number,
  tier: CompetitiveTier,
): number {
  const rules = getRuleset(o.rulesetId, o.rulesVersion),
    seat = o.identity.seat;
  const deltas = bids.map((declared, i) =>
    rules.scoreDeal({ declared, taken: taken[i]!, tricksInDeal: o.progression.cardsPerPlayer }),
  );
  const totals = o.publicScore.cumulativeTotals.map((score, i) => score + deltas[i]!);
  const round = dealsOfPhase(o.progression.round);
  const outcomes = o.publicScore.completedDeals
    .filter((d) => d.round === o.progression.round)
    .map((d) => ({
      indexInPhase: d.indexInPhase,
      cardsPerPlayer: d.cardsPerPlayer,
      declarations: d.declarations,
      tricksTaken: d.tricksTaken,
    }));
  outcomes.push({
    indexInPhase: o.progression.indexInPhase,
    cardsPerPlayer: o.progression.cardsPerPlayer,
    declarations: bids as [number, number, number, number],
    tricksTaken: taken as [number, number, number, number],
  });
  // Neutral, publicly seeded round-completion model. Retained qualification
  // probability is uncertain and not presented as a calibrated prediction.
  for (const future of round.slice(outcomes.length)) {
    const ft = [0, 0, 0, 0];
    for (let n = 0; n < future.cardsPerPlayer; n++) ft[Math.floor(random() * 4)]!++;
    const fb = ft.map((t) =>
      random() < (tier === 1 ? 0.3 : 0.4) ? t : Math.floor(random() * (future.cardsPerPlayer + 1)),
    );
    if (fb.reduce((a, b) => a + b, 0) === future.cardsPerPlayer)
      fb[3] = (fb[3]! + 1) % (future.cardsPerPlayer + 1);
    outcomes.push({
      indexInPhase: future.indexInPhase,
      cardsPerPlayer: future.cardsPerPlayer,
      declarations: fb as [number, number, number, number],
      tricksTaken: ft as [number, number, number, number],
    });
  }
  if (outcomes.length === round.length) {
    const premia = rules.resolvePremia(o.progression.round, outcomes);
    for (let i = 0; i < 4; i++) totals[i]! += premia.adjustments[i]!;
  }
  if (o.progression.dealNumber === DEALS.length) {
    const ranked = rankFinalScores(totals),
      own = ranked.find((r) => r.seatIndex === seat)!;
    const tied = ranked.filter((r) => r.placement === 1).length;
    return (own.placement === 1 ? 10000 / tied : 0) - own.placement * 100 + totals[seat]! * 0.001;
  }
  const rivals = totals.filter((_, i) => i !== seat);
  const late = o.progression.dealNumber / DEALS.length;
  const max = Math.max(...rivals);
  const average = rivals.reduce((a, b) => a + b, 0) / 3;
  return totals[seat]! - (0.15 + 0.55 * late) * max - 0.1 * average;
}

function guessBids(
  o: BotObservation,
  hands: Card[][],
  trump: Suit | null,
  ownBid: number | null,
): number[] {
  const declarations = [...o.declarations] as Declarations;
  if (ownBid != null) declarations[o.identity.seat] = ownBid;
  for (const seat of declarationOrder(o.progression.dealerSeat!)) {
    if (declarations[seat] != null) continue;
    const legal = legalDeclarationValues({
      declarations,
      cardsPerPlayer: o.progression.cardsPerPlayer,
      dealerSeat: o.progression.dealerSeat!,
      seatIndex: seat,
    });
    const estimate = Math.round(potential(hands[seat]!, trump));
    declarations[seat] = legal.reduce(
      (best, v) => (Math.abs(v - estimate) < Math.abs(best - estimate) ? v : best),
      legal[0]!,
    );
  }
  return declarations as number[];
}

function continueDeal(
  o: BotObservation,
  world: HypotheticalWorld,
  first: PlayedCard | null,
  bids: number[],
  trump: Suit | null,
  scenario: number,
  budget: Budget,
): number[] {
  const hands = world.hands.map((h) => [...h]),
    taken = [...o.tricksTaken];
  let trick = [...o.committedTrick],
    actor = o.identity.seat;
  if (first) {
    spend(budget);
    if (!o.pendingJoker) hands[actor] = hands[actor]!.filter((c) => c.id !== first.card.id);
    trick.push(first);
    actor = (actor + 1) % 4;
  } else actor = o.progression.firstLeaderSeat!;
  let completed = o.progression.cardsPerPlayer - Math.max(...hands.map((h) => h.length));
  // Reconstruct unresolved count by total public taken, not hand-length alone.
  completed = taken.reduce((a, b) => a + b, 0);
  while (completed < o.progression.cardsPerPlayer) {
    if (trick.length === 4) {
      const winner = resolveTrick({ plays: trick, trump }).winnerSeat;
      taken[winner]!++;
      actor = winner;
      trick = [];
      completed++;
      continue;
    }
    spend(budget);
    const play = rolloutPolicy({
      hand: hands[actor]!,
      trick,
      trump,
      seat: actor,
      bid: bids[actor]!,
      taken: taken[actor]!,
      remaining: o.progression.cardsPerPlayer - completed,
      scenario,
    });
    hands[actor] = hands[actor]!.filter((c) => c.id !== play.card.id);
    trick.push(play);
    actor = (actor + 1) % 4;
  }
  return taken;
}

export function analyzeCompetitive(
  projection: PlayerGameProjection,
  tier: CompetitiveTier,
  fallback: GameplayCommand,
  options: {
    seed?: string;
    transitions?: number;
    cancelled?: () => boolean;
    now?: () => number;
    maxMs?: number;
  } = {},
): SearchReport {
  const o = observeBot(projection),
    action = projection.local.legalActions.find((a) => a.type !== "reclaim_control")!;
  const policy = TIER_BUDGETS[tier];
  const now = options.now ?? (() => performance.now());
  const deadline = now() + Math.min(150, Math.max(0, options.maxMs ?? 150));
  const budget: Budget = {
    used: 0,
    limit: Math.max(0, Math.min(options.transitions ?? policy.transitions, policy.transitions)),
    cancelled: options.cancelled ?? (() => false),
    expired: () => now() >= deadline,
  };
  const seed = `${options.seed ?? COMPETITIVE_VERSION}/${o.rulesVersion}/${o.identity.gameId}/${o.identity.dealNumber}/${o.identity.seat}/${[...o.ownHand, ...(o.pendingJoker?.seatIndex === o.identity.seat ? [o.pendingJoker.card] : [])].map((c) => c.id).sort()}/${JSON.stringify(playsForSeed(o.committedTrick))}/${o.declarations}/${o.tricksTaken}/${o.publicScore.cumulativeTotals}`;
  const random = strategicRandom(seed);
  const endgame = Math.max(...o.remainingHandSizes) <= 2;
  const targetWorlds = policy.worlds * (tier === 3 && endgame ? 2 : 1);
  const plays =
    action.type === "play_card"
      ? completeActions([...o.ownHand], [...o.committedTrick], o.trump, o.identity.seat).filter(
          (p) => action.cardIds.includes(p.card.id),
        )
      : action.type === "choose_joker_semantic" && o.pendingJoker
        ? action.options.map((joker) => ({ ...o.pendingJoker!, joker }))
        : [];
  const candidates: Array<{
    key: string;
    play: PlayedCard | null;
    bid: number | null;
    trump: Suit | null;
    command: GameplayCommand;
  }> = plays.map((play) => ({
    key: key(play),
    play,
    bid: null,
    trump: o.trump,
    command:
      action.type === "choose_joker_semantic"
        ? { type: "choose_joker_semantic", semantic: play.joker! }
        : { type: "play_card", cardId: play.card.id, ...(play.joker ? { jokerSemantic: play.joker } : {}) },
  }));
  if (action.type === "declare")
    for (const value of action.values)
      candidates.push({
        key: `bid/${value}`,
        play: null,
        bid: value,
        trump: o.trump,
        command: { type: "declare", value },
      });
  if (action.type === "choose_trump")
    for (const suit of action.suits)
      candidates.push({
        key: `trump/${suit}`,
        play: null,
        bid: null,
        trump: suit,
        command: { type: "choose_trump", suit },
      });
  const sums = candidates.map(() => ({ sum: 0, exact: 0 }));
  let worlds = 0,
    sampleFailures = 0,
    exhausted = false;
  let failure: string | null = null;
  const model = projection.cards.completedTricks
    .flatMap((t) => t.cards)
    .filter((p) => p.card.kind === "joker" && p.joker?.mode === "COMPETE").length;
  for (let n = 0; n < targetWorlds; n++) {
    const world = sampleConsistentWorld(o, random, tier === 1 ? 32 : 128);
    if (!world) {
      sampleFailures++;
      continue;
    }
    // At the three-card trump choice, fill every hypothetical seat from random
    // stock, never from the actual next six cards in canonical state.
    if (action.type === "choose_trump") {
      for (let seat = 0; seat < 4; seat++) world.hands[seat]!.push(...world.stock.splice(0, 6));
    }
    const utilitySeed = `${seed}/world/${n}`;
    const batch: Array<{ utility: number; exact: number }> = [];
    try {
      for (const candidate of candidates) {
        const bids = guessBids(o, world.hands, candidate.trump, candidate.bid);
        const taken = continueDeal(
          o,
          world,
          candidate.play,
          bids,
          candidate.trump,
          tier === 1 ? 0 : (n + model) % 3,
          budget,
        );
        const utility = outcomeUtility(o, bids, taken, strategicRandom(utilitySeed), tier);
        batch.push({ utility, exact: Number(taken[o.identity.seat] === bids[o.identity.seat]) });
      }
    } catch (error) {
      failure =
        error instanceof Error && error.message === "SEARCH_BUDGET"
          ? "BUDGET"
          : "SIMULATION_FAILURE";
      exhausted = true;
      break;
    }
    // Admit complete common-world batches only; no unequal candidate budgets.
    for (let i = 0; i < batch.length; i++) {
      sums[i]!.sum += batch[i]!.utility;
      sums[i]!.exact += batch[i]!.exact;
    }
    worlds++;
  }
  const ranked = candidates
    .map((c, i) => ({
      ...c,
      meanUtility: worlds ? sums[i]!.sum / worlds : -Infinity,
      exactRate: worlds ? sums[i]!.exact / worlds : 0,
    }))
    .sort((a, b) => b.meanUtility - a.meanUtility || a.key.localeCompare(b.key));
  return {
    command: worlds ? (ranked[0]?.command ?? fallback) : fallback,
    worlds,
    transitions: budget.used,
    exhausted,
    sampleFailures,
    failure,
    candidates: ranked.map(({ key, meanUtility, exactRate }) => ({ key, meanUtility, exactRate })),
    plan: {
      bidState: o.intents[o.identity.seat]!,
      threatenedSeats: o.intents
        .map((v, i) => (v === "EXACT" && i !== o.identity.seat ? i : -1))
        .filter((i) => i >= 0),
      revision: o.identity.stateVersion,
      style: tier === 1 ? "conservative" : tier === 2 ? "tactical" : "competitive",
    },
  };
}
