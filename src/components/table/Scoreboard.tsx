import { Fragment } from "react";
import { GAME_PHASES, dealsOfPhase } from "@/domain/gameConfig";
import type { CanonicalPremiaTransferRecord, CanonicalRoundPremiaRecord } from "@/domain/gameState";
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
  if (!premia) return { bonus: false, removed: false };
  return premia.transfers.reduce(
    (flags, transfer: CanonicalPremiaTransferRecord) => ({
      bonus:
        flags.bonus ||
        (transfer.bonusSeat === seat && transfer.bonusDealIndex === indexInPhase),
      removed:
        flags.removed ||
        (transfer.targetSeat === seat && transfer.removedDealIndex === indexInPhase),
    }),
    { bonus: false, removed: false },
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
      className="sm:max-w-[min(96vw,72rem)]"
    >
      <div className="bg-[#f4efe4] p-2 text-[#274f91] sm:p-4">
        <div className="overflow-auto rounded-sm border border-[#315b96]/50 bg-[#f7f2e8] shadow-inner">
          <table
            className="w-full min-w-[44rem] border-collapse text-[12px] leading-none sm:text-sm"
            aria-label="Φύλλο βαθμολογίας"
          >
            <thead className="sticky top-0 z-20 bg-[#f7f2e8]">
              <tr className="h-11 border-b-2 border-[#315b96]/70">
                <th className="w-10 border-r-2 border-[#315b96]/60 px-1 font-normal" aria-label="Φύλλα" />
                {playerNames.map((name, seat) => (
                  <th
                    key={seat}
                    colSpan={2}
                    className={cn(
                      "border-r-2 border-[#315b96]/60 px-2 font-display text-sm font-semibold tracking-wide sm:text-base",
                      seat === playerNames.length - 1 && "border-r-0",
                    )}
                  >
                    <span className="block max-w-[12rem] truncate">{name}</span>
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
                            "h-7 border-b border-[#315b96]/45",
                            dealIndex === 0 && "border-t-2 border-t-[#315b96]/70",
                          )}
                        >
                          <th
                            scope="row"
                            className="w-10 border-r-2 border-[#315b96]/60 px-1 text-center font-medium tabular-nums"
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
                                  className="w-7 border-r border-[#315b96]/45 px-0.5 text-center font-medium tabular-nums"
                                  data-score-declaration={`${deal.dealNumber}:${seat}`}
                                >
                                  {declarationMark(declaration)}
                                </td>
                                <td
                                  className={cn(
                                    "min-w-20 border-r-2 border-[#315b96]/60 px-2 text-center tabular-nums",
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

                    {phasePremia && (
                      <tr
                        data-score-premia={phase.phase}
                        className="h-7 border-b border-[#315b96]/55 bg-[#eee6d7]/55"
                      >
                        <th
                          scope="row"
                          className="border-r-2 border-[#315b96]/60 px-1 text-center text-[10px] font-bold"
                          title="Πρέμια"
                        >
                          Π
                        </th>
                        {playerNames.map((_, seat) => (
                          <Fragment key={seat}>
                            <td className="border-r border-[#315b96]/45" />
                            <td
                              className={cn(
                                "border-r-2 border-[#315b96]/60 px-2 text-center text-[11px] font-semibold tabular-nums",
                                seat === playerNames.length - 1 && "border-r-0",
                              )}
                            >
                              {phasePremia.adjustments[seat] === 0
                                ? ""
                                : signedScore(phasePremia.adjustments[seat] ?? 0)}
                            </td>
                          </Fragment>
                        ))}
                      </tr>
                    )}

                    {phasePremia && (
                      <tr
                        data-score-round-total={phase.phase}
                        className="h-8 border-b-2 border-[#315b96]/75 bg-[#f2ebdf]"
                      >
                        <th
                          scope="row"
                          className="border-r-2 border-[#315b96]/60 px-1 text-center text-[10px] font-bold"
                          title="Σύνολο γύρου"
                        >
                          Σ
                        </th>
                        {playerNames.map((_, seat) => (
                          <Fragment key={seat}>
                            <td className="border-r border-[#315b96]/45" />
                            <td
                              className={cn(
                                "border-r-2 border-[#315b96]/60 px-2 text-center font-bold tabular-nums",
                                seat === playerNames.length - 1 && "border-r-0",
                              )}
                            >
                              {signedScore(phasePremia.totalsAfterPremia[seat] ?? 0)}
                            </td>
                          </Fragment>
                        ))}
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {hasFinalRanking && (
          <div
            className="grid grid-cols-4 gap-2 border-t-2 border-[#315b96]/70 px-2 pb-2 pt-4 sm:gap-4 sm:px-4"
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
                  <div className="font-display text-3xl italic leading-none sm:text-5xl">
                    {romanPlacement(placement)}
                  </div>
                  <div className="mt-1 truncate text-xs font-semibold sm:text-sm">
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
