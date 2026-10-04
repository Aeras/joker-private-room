import { Fragment, useEffect, useState } from "react";
import { GAME_PHASES, dealsOfPhase } from "@/domain/gameConfig";
import { computeTotals, type ScoreSheet, type SpecialRowKind } from "@/domain/scoreSheet";
import type { PlayerGameProjection } from "@/domain/projection";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";
import { Modal } from "../joker/Modal";

const SPECIAL_LABEL: Record<SpecialRowKind, string> = {
  bonus: t.bonus,
  penalty: t.penalty,
  premia: t.premia,
};

function ScoreCell({
  value,
  strong,
  detail,
}: {
  value: number | null | undefined;
  strong?: boolean;
  detail?: { declaration: number | null; tricks: number; cumulative: number | null } | undefined;
}) {
  return (
    <td
      className={cn(
        "px-2 py-2 text-center tabular-nums",
        value != null && value < 0 ? "font-semibold text-negative" : "text-foreground",
        strong && "text-lg font-display",
        strong && value != null && value >= 0 && "text-primary",
      )}
    >
      {value == null ? (
        <span className="text-muted-foreground/60">{t.scorePending}</span>
      ) : value != null && value < 0 ? (
        `−${Math.abs(value)}`
      ) : (
        value
      )}
      {detail && (
        <div className="mt-1 whitespace-nowrap text-[10px] text-muted-foreground">
          {t.declaration}: {detail.declaration ?? "·"} · {t.tricks}: {detail.tricks}
        </div>
      )}
      {detail?.cumulative != null && (
        <div className="text-[10px] text-muted-foreground">
          {t.scoreCumulative}: {detail.cumulative}
        </div>
      )}
    </td>
  );
}

export function Scoreboard({
  open,
  onClose,
  playerNames,
  sheet,
  projection,
}: {
  open: boolean;
  onClose: () => void;
  playerNames: string[];
  sheet: ScoreSheet;
  projection?: PlayerGameProjection;
}) {
  const totals = projection?.score.cumulativeTotals ?? computeTotals(sheet);
  const records = new Map(
    projection?.score.completedDeals.map((record) => [record.dealNumber, record]),
  );
  const byDeal = new Map(sheet.deals.map((d) => [d.dealNumber, d.scores]));
  const stickyL = "sticky left-0 z-10 bg-card";

  return (
    <Modal open={open} onClose={onClose} title={t.totalScores} className="sm:max-w-3xl">
      {projection && <LiveScoreStatus projection={projection} playerNames={playerNames} />}
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[22rem] border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-card">
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className={cn(stickyL, "w-10 px-2 py-2 text-left font-normal")}>#</th>
              <th className="w-12 px-1 py-2 font-normal">{t.cards}</th>
              {playerNames.map((n, i) => (
                <th
                  key={i}
                  className="truncate px-2 py-2 font-display text-sm font-normal text-foreground"
                >
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GAME_PHASES.map((phase) => (
              <Fragment key={phase.phase}>
                <tr className="bg-gold-soft">
                  <td
                    colSpan={2 + playerNames.length}
                    className="px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary"
                  >
                    {t.phase} {phase.phase}
                  </td>
                </tr>
                {dealsOfPhase(phase.phase).map((d) => (
                  <tr key={d.dealNumber} className="border-b border-border/50">
                    <td className={cn(stickyL, "px-2 py-2 text-muted-foreground tabular-nums")}>
                      {d.dealNumber}
                    </td>
                    <td className="px-1 py-2 text-center text-muted-foreground tabular-nums">
                      {d.cardsPerPlayer}
                    </td>
                    {playerNames.map((_, i) => (
                      <ScoreCell
                        key={i}
                        value={byDeal.get(d.dealNumber)?.[i]}
                        detail={
                          records.has(d.dealNumber)
                            ? {
                                declaration: records.get(d.dealNumber)!.declarations[i] ?? null,
                                tricks: records.get(d.dealNumber)!.tricksTaken[i] ?? 0,
                                cumulative: records.get(d.dealNumber)!.totalsAfterDeal[i] ?? null,
                              }
                            : projection?.progression.dealNumber === d.dealNumber
                              ? {
                                  declaration: projection.declarations.values[i] ?? null,
                                  tricks: projection.score.tricksTaken[i] ?? 0,
                                  cumulative: null,
                                }
                              : undefined
                        }
                      />
                    ))}
                  </tr>
                ))}
                {sheet.special
                  .filter((s) => s.phase === phase.phase)
                  .map((s, si) => (
                    <tr key={`s${si}`} className="border-b border-border/50 italic">
                      <td colSpan={2} className={cn(stickyL, "px-2 py-2 text-xs text-primary")}>
                        {s.label ?? SPECIAL_LABEL[s.kind]}
                      </td>
                      {playerNames.map((_, i) => (
                        <ScoreCell key={i} value={s.values[i]} />
                      ))}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-20 bg-card">
            <tr className="border-t-2 border-primary/60">
              <td
                colSpan={2}
                className={cn(
                  stickyL,
                  "px-2 py-3 font-display text-sm tracking-[0.2em] text-primary",
                )}
              >
                {t.total}
              </td>
              {totals.map((v, i) => (
                <ScoreCell key={i} value={v} strong />
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  );
}

function LiveScoreStatus({
  projection,
  playerNames,
}: {
  projection: PlayerGameProjection;
  playerNames: string[];
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const actor = projection.progression.currentActorSeat;
  const deadline = projection.timing?.currentHumanDeadline ?? projection.local.humanDeadline;
  const seconds = deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000)) : null;
  return (
    <div
      role="status"
      className="sticky top-0 z-30 border-b border-border bg-card px-4 py-2 text-sm"
    >
      {projection.lifecycle === "complete" ? (
        t.totalScores
      ) : (
        <>
          {t.scoreLive} · {t.deal} {projection.progression.dealNumber} ·{" "}
          {actor == null ? t.scorePending : playerNames[actor]}
          {seconds != null ? ` · ${seconds}s` : ""}
        </>
      )}
    </div>
  );
}
