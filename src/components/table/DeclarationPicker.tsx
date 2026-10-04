import { JButton } from "../joker/JButton";
import {
  declarationAccessibleLabel,
  declarationDisplayValue,
} from "./tableControlModel";

export function DeclarationPicker({
  values,
  legalValues,
  busy,
  onSelect,
}: {
  values: readonly number[];
  legalValues: readonly number[];
  busy: boolean;
  onSelect: (value: number) => void;
}) {
  const legal = new Set(legalValues);
  const columns = values.length > 7 ? 5 : Math.max(1, values.length);

  return (
    <div className="mb-3 max-w-[94vw] rounded-2xl border border-primary/30 bg-black/80 p-3 text-center shadow-2xl backdrop-blur">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        Δήλωσε μπάζες
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(3rem, 1fr))` }}
      >
        {values.map((value) => {
          const allowed = legal.has(value);
          return (
            <JButton
              key={value}
              size="sm"
              className="h-12 min-w-12 px-3 text-base font-bold"
              disabled={busy || !allowed}
              aria-disabled={busy || !allowed}
              aria-label={declarationAccessibleLabel(value)}
              title={!allowed ? "Δεν επιτρέπεται για τον dealer." : declarationAccessibleLabel(value)}
              onClick={() => allowed && onSelect(value)}
            >
              {declarationDisplayValue(value)}
            </JButton>
          );
        })}
      </div>
    </div>
  );
}
