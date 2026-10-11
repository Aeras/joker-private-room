import { useLayoutEffect, useRef } from "react";
import type { DurakCard } from "./rules";
import type { DurakPresentationEvent } from "./engine";
import { DurakCardFace } from "./DurakTableVisuals";
import { DURAK_CARD_FLIGHT_MS } from "./useDurakPresentation";

export function DurakPlayedCard({
  card,
  flight,
  localSeat,
}: {
  card: DurakCard;
  flight: DurakPresentationEvent | null;
  localSeat: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const active = flight?.card.suit === card.suit && flight?.card.rank === card.rank;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!active || !flight || !element || typeof element.animate !== "function") return;
    const table = element.closest(".durak-fullscreen");
    const source = table?.querySelector(
      flight.seat === localSeat
        ? ".durak-fullscreen-hand"
        : `[data-durak-opponent-seat="${flight.seat}"] .durak-fullscreen-avatar`,
    );
    if (!source) return;
    const from = source.getBoundingClientRect(),
      to = element.getBoundingClientRect();
    const x = from.left + from.width / 2 - to.left - to.width / 2;
    const y = from.top + from.height / 2 - to.top - to.height / 2;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const animation = element.animate(
      reduced
        ? [{ opacity: 0.5 }, { opacity: 1 }]
        : [
            { transform: `translate(${x}px, ${y}px) rotate(${x < 0 ? -12 : 12}deg) scale(.92)` },
            {
              transform: `translate(${x * 0.45}px, ${y * 0.45 - Math.min(28, Math.abs(y) * 0.12)}px) rotate(4deg) scale(1.04)`,
              offset: 0.5,
            },
            { transform: "translate(0, 0) rotate(0deg) scale(1)" },
          ],
      { duration: reduced ? 100 : DURAK_CARD_FLIGHT_MS, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
    return () => animation.cancel();
  }, [active, flight, localSeat]);
  return (
    <span
      ref={ref}
      className="durak-played-card"
      data-durak-flight={active ? flight?.sequence : undefined}
    >
      <DurakCardFace card={card} />
    </span>
  );
}
