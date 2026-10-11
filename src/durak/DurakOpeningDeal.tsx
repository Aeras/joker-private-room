import { useLayoutEffect, useRef } from "react";
import { DurakCardBack, DurakCardFace } from "./DurakTableVisuals";
import {
  durakDealTiming,
  DURAK_DEAL_STAGGER_MS,
  DURAK_DEAL_FLIGHT_MS,
  DURAK_TRUMP_FLIP_MS,
  DURAK_TRUMP_PLACE_MS,
  DURAK_STOCK_PLACE_MS,
} from "./dealTiming";
import type { DurakGameView } from "@/services/durakRoomFunctions";
import { durakTableText as text } from "@/i18n/durak.el";

/** Closed-card presentation only: never receives opponents' actual cards. */
export function DurakOpeningDeal({
  game,
  onComplete,
}: {
  game: DurakGameView;
  onComplete: (id: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const snapshot = useRef(game);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const id = game.dealReadyAt;
  useLayoutEffect(() => {
    const layer = root.current;
    const initial = snapshot.current;
    if (!layer || !id) return;
    const table = layer.closest(".durak-fullscreen");
    const bounds = layer.getBoundingClientRect();
    const timing = durakDealTiming(initial.handSizes.length);
    const elapsed = Math.max(0, timing.duration - (id - (initial.dealServerNow ?? id)));
    const lead = Math.max(0, (initial.dealStartedAt ?? 0) - (initial.dealServerNow ?? id));
    const animations: Animation[] = [];
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const animate = (
      element: HTMLElement | null,
      frames: Keyframe[],
      duration: number,
      delay: number,
    ) => {
      if (!element || typeof element.animate !== "function") return;
      const animation = element.animate(frames, {
        duration,
        delay: delay + lead,
        fill: "both",
        easing: "cubic-bezier(.2,.8,.2,1)",
      });
      animation.currentTime = elapsed;
      animations.push(animation);
    };
    const source = { x: bounds.width * 0.5, y: bounds.height * 0.43 };
    layer.querySelectorAll<HTMLElement>("[data-deal-card]").forEach((element) => {
      const beat = Number(element.dataset["dealCard"]);
      const seat = beat % initial.handSizes.length;
      const index = Math.floor(beat / initial.handSizes.length);
      const target = table
        ?.querySelector(`[data-durak-opponent-seat="${seat}"] .durak-fullscreen-opponent-backs`)
        ?.getBoundingClientRect();
      const x =
        seat === initial.seat
          ? bounds.width * 0.5
          : target
            ? target.left + target.width / 2 - bounds.left
            : bounds.width * 0.5;
      const y =
        seat === initial.seat ? bounds.height - 30 : target ? target.top - bounds.top + 20 : 100;
      const dx = x - source.x + (index - 2.5) * 8;
      const dy = y - source.y;
      element.style.transform = `translate(${dx}px, ${dy}px)`;
      animate(
        element,
        reduced
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { transform: "translate(0, 0) rotate(0deg)", opacity: 0, offset: 0 },
              { transform: "translate(0, 0) rotate(0deg)", opacity: 1, offset: 0.01 },
              {
                transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 20}px) rotate(5deg)`,
                opacity: 1,
                offset: 0.5,
              },
              {
                transform: `translate(${dx}px, ${dy}px) rotate(${(index - 2.5) * 2}deg)`,
                opacity: 1,
              },
            ],
        DURAK_DEAL_FLIGHT_MS,
        beat * DURAK_DEAL_STAGGER_MS,
      );
    });
    const stock = table?.querySelector("[data-durak-stock-trump] > *")?.getBoundingClientRect();
    const back = table?.querySelector("[data-durak-stock-back] > *")?.getBoundingClientRect();
    const origin = layer.querySelector(".durak-deal-origin")!.getBoundingClientRect();
    const dx = stock ? stock.left + stock.width / 2 - bounds.left - source.x : -80;
    const dy = stock ? stock.top + stock.height / 2 - bounds.top - source.y : 0;
    const scale = stock ? stock.width / origin.height : 0.7;
    const bx = back ? back.left + back.width / 2 - bounds.left - source.x : dx + 20;
    const by = back ? back.top + back.height / 2 - bounds.top - source.y : dy - 12;
    const backScale = back ? back.width / origin.width : 0.7;
    const flip = layer.querySelector<HTMLElement>(".durak-deal-trump-flip");
    animate(
      flip,
      [{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }],
      DURAK_TRUMP_FLIP_MS,
      timing.revealAt,
    );
    animate(
      layer.querySelector<HTMLElement>(".durak-deal-trump"),
      [
        { transform: "translate(0, 0) rotate(0deg)" },
        { transform: `translate(${dx}px, ${dy}px) rotate(90deg) scale(${scale})` },
      ],
      DURAK_TRUMP_PLACE_MS,
      timing.placeAt,
    );
    animate(
      layer.querySelector<HTMLElement>(".durak-deal-stock"),
      [
        { transform: "translate(0, 0)", zIndex: 3 },
        { transform: `translate(${bx}px, ${by}px) scale(${backScale})`, zIndex: 6 },
      ],
      DURAK_STOCK_PLACE_MS,
      timing.stockAt,
    );
    const timer = setTimeout(
      () => complete.current(id),
      Math.max(0, id - (initial.dealServerNow ?? id)),
    );
    return () => {
      clearTimeout(timer);
      animations.forEach((animation) => animation.cancel());
    };
  }, [id]);
  return (
    <div
      ref={root}
      className="durak-opening-deal"
      data-durak-opening-deal
      aria-label={text.dealing}
    >
      <div className="durak-deal-origin">
        {Array.from({ length: game.handSizes.length * 6 }, (_, beat) => (
          <div className="durak-deal-card" data-deal-card={beat} key={beat}>
            <DurakCardBack />
          </div>
        ))}
        <div className="durak-deal-trump">
          <div className="durak-deal-trump-flip">
            <div className="durak-deal-back">
              <DurakCardBack />
            </div>
            <div className="durak-deal-face">
              <DurakCardFace card={game.trumpCard} />
            </div>
          </div>
        </div>
        {game.stock > 0 && (
          <div className="durak-deal-stock">
            <DurakCardBack />
            <DurakCardBack />
          </div>
        )}
      </div>
      <span className="durak-deal-caption" role="status">
        {text.dealing}
      </span>
    </div>
  );
}
