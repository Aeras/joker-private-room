import { useId, useState } from "react";
import type { BiribaMeld } from "./rules";
import type { BiribaExtensionOptions } from "./extensionOptions";

export type BiribaExtensionTarget = {
  /** Authoritative global meld index, not the team's visual number. */
  index: number;
  /** 1-based number displayed within the owning team. */
  displayNumber: number;
  choices: BiribaExtensionOptions;
};

/**
 * Inline accordion: only a wildcard with two legal endpoints expands.
 * «Πίσω» sits on the LEFT; «Μπροστά» on the RIGHT. No popup or overlay.
 */
export function BiribaExtensionActions({
  targets,
  busy,
  onExtend,
}: {
  targets: readonly BiribaExtensionTarget[];
  busy: boolean;
  onExtend: (index: number, meld: BiribaMeld) => void;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const controlId = useId();

  const send = (target: BiribaExtensionTarget, meld: BiribaMeld) => {
    setExpandedIndex(null);
    onExtend(target.index, meld);
  };

  return (
    <div className="biriba-actions biriba-actions--right biriba-extension-list text-white">
      {targets.map(target => {
        const bothSides = Boolean(target.choices.behind && target.choices.ahead &&
          !target.choices.automatic);
        const expanded = bothSides && expandedIndex === target.index;
        const id = `${controlId}-${target.index}`;
        return (
          <div className="biriba-extension-item" key={target.index}>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-amber-600 font-bold shadow hover:bg-amber-500"
              aria-expanded={bothSides ? expanded : undefined}
              aria-controls={bothSides ? id : undefined}
              onClick={() => {
                if (bothSides) {
                  setExpandedIndex(previous => previous === target.index ? null : target.index);
                  return;
                }
                const automatic = target.choices.automatic ??
                  target.choices.behind ?? target.choices.ahead;
                if (automatic) send(target, automatic);
              }}
            >
              Κόλλημα #{target.displayNumber}
            </button>
            {bothSides && (
              <div
                id={id}
                className={`biriba-extension-choices${expanded ? " biriba-extension-choices--open" : ""}`}
                aria-hidden={!expanded}
              >
                <button
                  type="button"
                  className="biriba-extension-side"
                  disabled={busy || !expanded}
                  tabIndex={expanded ? 0 : -1}
                  onClick={() => { if (target.choices.behind) send(target, target.choices.behind); }}
                >
                  Πίσω
                </button>
                <button
                  type="button"
                  className="biriba-extension-side"
                  disabled={busy || !expanded}
                  tabIndex={expanded ? 0 : -1}
                  onClick={() => { if (target.choices.ahead) send(target, target.choices.ahead); }}
                >
                  Μπροστά
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
