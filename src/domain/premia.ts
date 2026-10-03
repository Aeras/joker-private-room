import { dealsOfPhase, SEAT_COUNT, type PhaseConfig } from "./gameConfig";
import { scoreDeal } from "./scoring";

export interface RoundDealOutcome {
  indexInPhase: number;
  cardsPerPlayer: number;
  declarations: [number, number, number, number];
  tricksTaken: [number, number, number, number];
}

export interface PremiaTransfer {
  bonusSeat: number;
  bonusDealIndex: number;
  bonusAmount: number;
  targetSeat: number;
  removedDealIndex: number | null;
  removedAmount: number;
}

export interface PremiaResolution {
  qualified: [boolean, boolean, boolean, boolean];
  adjustments: [number, number, number, number];
  transfers: PremiaTransfer[];
}

function canonicalScores(outcome: RoundDealOutcome): [number, number, number, number] {
  return [0, 1, 2, 3].map((seat) =>
    scoreDeal({
      declared: outcome.declarations[seat]!,
      taken: outcome.tricksTaken[seat]!,
      tricksInDeal: outcome.cardsPerPlayer,
    }),
  ) as [number, number, number, number];
}

function bestEligibleScore(
  outcomes: readonly RoundDealOutcome[],
  seat: number,
): { indexInPhase: number; amount: number } | null {
  let best: { indexInPhase: number; amount: number } | null = null;
  for (const outcome of outcomes.slice(0, -1)) {
    const amount = canonicalScores(outcome)[seat]!;
    if (amount < 150) continue;
    if (!best || amount > best.amount) {
      best = { indexInPhase: outcome.indexInPhase, amount };
    }
  }
  return best;
}

function validateRoundOutcomes(
  phase: PhaseConfig["phase"],
  outcomes: readonly RoundDealOutcome[],
): void {
  const expected = dealsOfPhase(phase);
  if (outcomes.length !== expected.length) {
    throw new Error(`Phase ${phase} requires ${expected.length} completed deal outcomes`);
  }
  expected.forEach((deal, index) => {
    const outcome = outcomes[index];
    if (!outcome || outcome.indexInPhase !== deal.indexInPhase) {
      throw new Error("Round outcomes must be complete and in canonical order");
    }
    if (outcome.cardsPerPlayer !== deal.cardsPerPlayer) {
      throw new Error("Round outcome cardsPerPlayer does not match canonical schedule");
    }
    if (
      outcome.declarations.some((value) => !Number.isInteger(value) || value < 0 || value > deal.cardsPerPlayer) ||
      outcome.tricksTaken.some((value) => !Number.isInteger(value) || value < 0 || value > deal.cardsPerPlayer)
    ) {
      throw new Error("Invalid declaration or trick count in round outcome");
    }
  });
}

function buildQualifiedRuns(qualified: readonly boolean[]): number[][] {
  const firstNonQualified = qualified.findIndex((value) => !value);
  if (firstNonQualified === -1) {
    throw new Error("All four seats cannot qualify for premia under canonical declaration rules");
  }

  const runs: number[][] = [];
  let current: number[] = [];
  for (let step = 1; step <= SEAT_COUNT; step += 1) {
    const seat = (firstNonQualified + step) % SEAT_COUNT;
    if (qualified[seat]) {
      current.push(seat);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

export function resolvePremia(
  phase: PhaseConfig["phase"],
  outcomes: readonly RoundDealOutcome[],
): PremiaResolution {
  validateRoundOutcomes(phase, outcomes);

  const qualified = [0, 1, 2, 3].map((seat) =>
    outcomes.every((outcome) => outcome.declarations[seat] === outcome.tricksTaken[seat]),
  ) as [boolean, boolean, boolean, boolean];

  const adjustments: [number, number, number, number] = [0, 0, 0, 0];
  const transfers: PremiaTransfer[] = [];

  for (const run of buildQualifiedRuns(qualified)) {
    let selectedBonus: { seat: number; indexInPhase: number; amount: number } | null = null;
    for (const seat of run) {
      const candidate = bestEligibleScore(outcomes, seat);
      if (!candidate) continue;
      selectedBonus = { seat, ...candidate };
      break;
    }
    if (!selectedBonus) continue;

    const lastSeat = run[run.length - 1]!;
    const targetSeat = (lastSeat + 1) % SEAT_COUNT;
    if (qualified[targetSeat]) throw new Error("Premia target must be the next non-premia seat");

    const removal = bestEligibleScore(outcomes, targetSeat);
    adjustments[selectedBonus.seat] += selectedBonus.amount;
    if (removal) adjustments[targetSeat] -= removal.amount;

    transfers.push({
      bonusSeat: selectedBonus.seat,
      bonusDealIndex: selectedBonus.indexInPhase,
      bonusAmount: selectedBonus.amount,
      targetSeat,
      removedDealIndex: removal?.indexInPhase ?? null,
      removedAmount: removal?.amount ?? 0,
    });
  }

  return { qualified, adjustments, transfers };
}
