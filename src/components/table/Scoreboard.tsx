import { Fragment } from "react";
import { GAME_PHASES, dealsOfPhase } from "@/domain/gameConfig";
import type { CanonicalRoundPremiaRecord } from "@/domain/gameState";
import type { PlayerGameProjection } from "@/domain/projection";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";
import { Modal } from "../joker/Modal";

function signedScore(value: number): string {
  if (value < 0) return `−${Math.abs(value)}`;
  return String(value);
}

function declarationMark(value: number | null | undefined): string {
  if (value == null) return "";
  return value === 0 ? "—" : String(value);
}

function romanPlacement(value: number | null | undefined): string {
  if (value === 1) return "I";
  if (value === 2) return "II";
  if (value === 3) return "III";
  if (value === 4) return "IV";
  return "";
}

function transferForCell(
  premia: CanonicalRoundPremiaRecord | undefined,
  seat: number,
  indexInPhase: number,
): { bonus: boolean; removed: boolean } {
  let bonus = false;
  let removed = false;
  for (const transfer of premia?.transfers ?? []) {
    if (transfer.bonusSeat === seat && transfer.bonusDealIndex === indexInPhase) bonus = true;
    if (transfer.targetSeat === seat && transfer.removedDealIndex === indexInPhase) removed = true;
  }
  return { bonus, removed };
}

function phaseScoreTotals(
  projection: PlayerGameProjection,
  round: 1 | 2 | 3 | 4,
): [number, number, number, number] | null {
  const premia = projection.score.roundPremia.find((record) => record.round === round);
  if (!premia) return null;
  const phaseDeals = projection.score.completedDeals.filter((record) => record.round === round);
  const dealTotals = [0, 0, 0, 0] as [number, number, number, number];
  for (const record of phaseDeals) {
    for (let seat = 0; seat < 4; seat += 1) dealTotals[seat] += record.dealScores[seat] ?? 0;
  }
  return dealTotals.map(
    (value, seat) => value + (premia.adjustments[seat] ?? 0),
  ) as [number, number, number, number];
}

function SummaryRow({
  phase,
  kind,
  values,
  playerCount,
}: {
  phase: number;
  kind: "round" | "cumulative";
  values: readonly number[] | null;
  playerCount: number;
}) {
  const cumulative = kind === "cumulative";
  return (
    <tr
      data-score-summary={`${phase}:${kind}`}
      className={cn(
        "h-6 border-b border-[#315b96]/60",
        cumulative ? "border-b-2 bg-[#ece4d5]/70 font-bold" : "bg-[#f2ebdf]/70 font-semibold",
      )}
    >
      <th
        scope="row"
        className="w-8 border-r-2 border-[#315b96]/60 px-0.5 text-center text-[9px] font-bold sm:text-[10px]"
        title={cumulative ? "Συνολικό αποτέλεσμα παιχνιδιού" : "Σύνολο γύρου"}
      >
        {cumulative ? "Σ" : "Γ"}
      </th>
      {Array.from({ length: playerCount }, (_, seat) => (
        <Fragment key={seat}>
          <td className="w-5 border-r border-[#315b96]/45" />
          <td
            className={cn(
              "min-w-14 border-r-2 border-[#315b96]/60 px-1 text-center text-[11px] tabular-nums sm:text-xs",
              seat === playerCount - 1 && "border-r-0",
            )}
          >
            {values ? signedScore(values[seat] ?? 0) : ""}
          </td>
        </Fragment>
      ))}
    </tr>
  );
}

function ScoreValue({
  value,
  bonus,
  removed,
}: {
  value: number | null | undefined;
  bonus?: boolean;
  removed?: boolean;
}) {
  if (value == null) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium tabular-nums",
        removed && "line-through decoration-2 decoration-[#274f91]/80",
      )}
      aria-label={
        bonus
          ? `${signedScore(value)}, μπόνους διπλασιασμού`
          : removed
            ? `${signedScore(value)}, διαγράφηκε από πρέμια`
            : undefined
      }
    >
      {signedScore(value)}
      {bonus && (
        <span className="text-[0.72em] font-bold no-underline" aria-hidden>
          ✓
        </span>
      )}
    </span>
  );
}

export function Scoreboard({
  open,
  onClose,
  playerNames,
  projection,
}: {
  open: boolean;
  onClose: () => void;
  playerNames: string[];
  projection: PlayerGameProjection;
}) {
  const completedDeals = new Map(
    projection.score.completedDeals.map((record) => [record.dealNumber, record]),
  );
  const premiaByRound = new Map(
    projection.score.roundPremia.map((record) => [record.round, record]),
  );
  const finalPlacements = projection.score.finalPlacements;
  const hasFinalRanking =
    projection.lifecycle === "complete" &&
    finalPlacements.every((placement) => placement != null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.totalScores}
      className="sm:max-w-[min(90vw,58rem)]"
    >
      <div className="bg-[#f4efe4] p-1.5 text-[#274f91] sm:p-2.5">
        <div className="overflow-auto rounded-sm border border-[#315b96]/50 bg-[#f7f2e8] shadow-inner">
          <table
            className="mx-auto w-auto min-w-[36rem] border-collapse text-[11px] leading-none sm:min-w-[40rem] sm:text-xs"
            aria-label="Φύλλο βαθμολογίας"
          >
            <thead className="sticky top-0 z-20 bg-[#f7f2e8]">
              <tr className="h-9 border-b-2 border-[#315b96]/70">
                <th className="w-8 border-r-2 border-[#315b96]/60 px-0.5 font-normal" aria-label="Φύλλα" />
                {playerNames.map((name, seat) => (
                  <th
                    key={seat}
                    colSpan={2}
                    className={cn(
                      "border-r-2 border-[#315b96]/60 px-1.5 font-display text-xs font-semibold tracking-wide sm:text-sm",
                      seat === playerNames.length - 1 && "border-r-0",
                    )}
                  >
                    <span className="block max-w-[9rem] truncate">{name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GAME_PHASES.map((phase) => {
                const phasePremia = premiaByRound.get(phase.phase);
                return (
                  <Fragment key={phase.phase}>
                    {dealsOfPhase(phase.phase).map((deal, dealIndex) => {
                      const record = completedDeals.get(deal.dealNumber);
                      const isCurrentDeal =
                        projection.lifecycle !== "complete" &&
                        projection.progression.dealNumber === deal.dealNumber;
                      return (
                        <tr
                          key={deal.dealNumber}
                          data-score-deal={deal.dealNumber}
                          className={cn(
                            "h-6 border-b border-[#315b96]/45",
                            dealIndex === 0 && "border-t-2 border-t-[#315b96]/70",
                          )}
                        >
                          <th
                            scope="row"
                            className="w-8 border-r-2 border-[#315b96]/60 px-0.5 text-center font-medium tabular-nums"
                          >
                            {deal.cardsPerPlayer}
                          </th>
                          {playerNames.map((_, seat) => {
                            const markers = transferForCell(
                              phasePremia,
                              seat,
                              deal.indexInPhase,
                            );
                            const declaration =
                              record?.declarations[seat] ??
                              (isCurrentDeal ? projection.declarations.values[seat] : null);
                            return (
                              <Fragment key={seat}>
                                <td
                                  className="w-5 border-r border-[#315b96]/45 px-0 text-center font-medium tabular-nums"
                                  data-score-declaration={`${deal.dealNumber}:${seat}`}
                                >
                                  {declarationMark(declaration)}
                                </td>
                                <td
                                  className={cn(
                                    "min-w-14 border-r-2 border-[#315b96]/60 px-1 text-center tabular-nums",
                                    seat === playerNames.length - 1 && "border-r-0",
                                  )}
                                  data-score-points={`${deal.dealNumber}:${seat}`}
                                >
                                  <ScoreValue
                                    value={record?.dealScores[seat]}
                                    bonus={markers.bonus}
                                    removed={markers.removed}
                                  />
                                </td>
                              </Fragment>
                            );
                          })}
                        </tr>
                      );
                    })}

                    <SummaryRow
                      phase={phase.phase}
                      kind="round"
                      values={phaseScoreTotals(projection, phase.phase)}
                      playerCount={playerNames.length}
                    />
                    {phase.phase > 1 && (
                      <SummaryRow
                        phase={phase.phase}
                        kind="cumulative"
                        values={phasePremia?.totalsAfterPremia ?? null}
                        playerCount={playerNames.length}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {hasFinalRanking && (
          <div
            className="mx-auto grid max-w-[40rem] grid-cols-4 gap-2 border-t-2 border-[#315b96]/70 px-2 pb-1.5 pt-2.5 sm:gap-3"
            aria-label="Τελική κατάταξη"
          >
            {[1, 2, 3, 4].map((placement) => {
              const seat = finalPlacements.findIndex((value) => value === placement);
              if (seat < 0) return null;
              return (
                <div
                  key={placement}
                  className="min-w-0 text-center text-[#274f91]"
                  data-final-placement={placement}
                >
                  <div className="font-display text-2xl italic leading-none sm:text-3xl">
                    {romanPlacement(placement)}
                  </div>
                  <div className="mt-1 truncate text-[10px] font-semibold sm:text-xs">
                    {playerNames[seat]}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
