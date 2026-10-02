import { Fragment } from "react";
import { GAME_PHASES, dealsOfPhase } from "@/domain/gameConfig";
import { computeTotals, type ScoreSheet, type SpecialRowKind } from "@/domain/scoreSheet";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";
import { Modal } from "../joker/Modal";

const SPECIAL_LABEL: Record<SpecialRowKind, string> = { bonus: t.bonus, penalty: t.penalty, premia: t.premia };

function ScoreCell({ value, strong }: { value: number | null | undefined; strong?: boolean }) {
  if (value == null) return <td className="px-2 py-2 text-center text-muted-foreground/40">·</td>;
  return (
    <td
      className={cn(
        "px-2 py-2 text-center tabular-nums",
        value < 0 ? "font-semibold text-negative" : "text-foreground",
        strong && "text-lg font-display",
        strong && value >= 0 && "text-primary",
      )}
    >
      {value < 0 ? `−${Math.abs(value)}` : value}
    </td>
  );
}

export function Scoreboard({
  open,
  onClose,
  playerNames,
  sheet,
}: {
  open: boolean;
  onClose: () => void;
  playerNames: string[];
  sheet: ScoreSheet;
}) {
  const totals = computeTotals(sheet);
  const byDeal = new Map(sheet.deals.map((d) => [d.dealNumber, d.scores]));
  const stickyL = "sticky left-0 z-10 bg-card";

  return (
    <Modal open={open} onClose={onClose} title={t.totalScores} className="sm:max-w-3xl">
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[22rem] border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-card">
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className={cn(stickyL, "w-10 px-2 py-2 text-left font-normal")}>#</th>
              <th className="w-12 px-1 py-2 font-normal">{t.cards}</th>
              {playerNames.map((n, i) => (
                <th key={i} className="truncate px-2 py-2 font-display text-sm font-normal text-foreground">
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GAME_PHASES.map((phase) => (
              <Fragment key={phase.phase}>
                <tr className="bg-gold-soft">
                  <td colSpan={2 + playerNames.length} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    {t.phase} {phase.phase}
                  </td>
                </tr>
                {dealsOfPhase(phase.phase).map((d) => (
                  <tr key={d.dealNumber} className="border-b border-border/50">
                    <td className={cn(stickyL, "px-2 py-2 text-muted-foreground tabular-nums")}>{d.dealNumber}</td>
                    <td className="px-1 py-2 text-center text-muted-foreground tabular-nums">{d.cardsPerPlayer}</td>
                    {playerNames.map((_, i) => (
                      <ScoreCell key={i} value={byDeal.get(d.dealNumber)?.[i]} />
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
              <td colSpan={2} className={cn(stickyL, "px-2 py-3 font-display text-sm tracking-[0.2em] text-primary")}>
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
