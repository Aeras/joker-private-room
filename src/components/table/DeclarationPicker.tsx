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
    <div className="mb-3 w-fit overflow-hidden rounded-2xl border border-black/15 bg-white text-center shadow-2xl">
      <div className="border-b border-black/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black/75">
        Δήλωσε μπάζες
      </div>
      <div className="grid grid-cols-5 gap-px bg-black/10 p-px [--choice-size:clamp(60px,5vw,72px)] [@media(max-height:360px)]:[--choice-size:60px]">
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
              className="flex h-[var(--choice-size)] w-[var(--choice-size)] items-center justify-center bg-white text-xl font-extrabold text-black transition-colors enabled:hover:bg-black/5 enabled:active:bg-black/10 disabled:cursor-not-allowed disabled:bg-[#f3f3f3] disabled:text-[#a8a8a8]"
            >
              <span className={value === 0 ? "text-sm font-extrabold" : undefined}>
                {value === 0 ? "Πάσο" : value}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
