import { DurakCardBack } from "./DurakTableVisuals";
import { discardLanding } from "./discardGeometry";
export function DurakDiscardPile({ count }: { count: number }) {
  return (
    <div
      className="durak-discard-pile"
      data-durak-discard-pile
      data-count={count}
      aria-label={`Απορριμμένα φύλλα: ${count}`}
    >
      <div className="durak-discard-mound" aria-hidden="true">
        {Array.from({ length: Math.min(count, 20) }, (_, i) => {
          const index = Math.max(0, count - 20) + i,
            { x, y, angle } = discardLanding(index);
          return (
            <span
              key={index}
              className="durak-discard-layer"
              data-discard-index={index}
              style={{ left: x, top: y, transform: `rotate(${angle}deg)`, zIndex: index }}
            >
              <DurakCardBack />
            </span>
          );
        })}
      </div>
      <span className="durak-discard-count">{count} εκτός παιχνιδιού</span>
    </div>
  );
}
