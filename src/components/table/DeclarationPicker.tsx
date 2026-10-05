import { declarationAccessibleLabel } from "./tableControlModel";

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

  return (
    <div className="mb-3 w-[min(32rem,90vw)] overflow-hidden rounded-2xl border border-primary/35 bg-black/85 text-center shadow-2xl backdrop-blur">
      <div className="border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        Δήλωσε μπάζες
      </div>
      <div className="grid grid-cols-5">
        {values.map((value) => {
          const allowed = legal.has(value);
          const disabled = busy || !allowed;
          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              aria-disabled={disabled}
              aria-label={declarationAccessibleLabel(value)}
              title={allowed ? declarationAccessibleLabel(value) : "Δεν είναι διαθέσιμη σε αυτή τη μοιρασιά."}
              onClick={() => allowed && onSelect(value)}
              className="flex h-12 items-center justify-center border-b border-r border-white/10 px-2 text-base font-bold text-foreground transition-colors enabled:hover:bg-primary/15 enabled:active:bg-primary/25 disabled:cursor-not-allowed disabled:text-white/20"
            >
              {value === 0 ? "Πάσο" : value}
            </button>
          );
        })}
      </div>
    </div>
  );
}
