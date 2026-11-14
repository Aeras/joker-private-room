import { useLayoutEffect, useRef } from "react";
import { DurakCardBack, DurakCardFace } from "./DurakTableVisuals";
import {
  durakDealTiming,
  DURAK_DEAL_STAGGER_MS,
  DURAK_DEAL_FLIGHT_MS,
  DURAK_TRUMP_FLIP_MS,
  DURAK_TRUMP_PLACE_MS,
  DURAK_STOCK_PLACE_MS,
  DURAK_HAND_ENTRANCE_MS,
} from "./dealTiming";
import { DURAK_SEAT_POSITIONS } from "./rules";
import type { DurakGameView } from "@/services/durakRoomFunctions";
import { durakTableText as text } from "@/i18n/durak.el";
import { dealProgress } from "@/components/table/dealtCardMotion";
import { playGameSound } from "@/lib/gameAudio";

/** Closed-card presentation only: never receives opponents' actual cards. */
export function DurakOpeningDeal({
  game,
  onComplete,
  onHandEntrance,
}: {
  game: DurakGameView;
  onComplete: (id: number) => void;
  onHandEntrance?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const snapshot = useRef(game);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const handEntrance = useRef(onHandEntrance);
  handEntrance.current = onHandEntrance;
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
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const animate = (
      element: HTMLElement | null,
      frames: Keyframe[],
      duration: number,
      delay: number,
      easing = "cubic-bezier(.2,.8,.2,1)",
    ) => {
      if (!element || typeof element.animate !== "function") return;
      const animation = element.animate(frames, {
        duration,
        delay: delay + lead,
        fill: "both",
        easing,
      });
      animation.currentTime = elapsed;
      animations.push(animation);
    };

    if (!reduced) {
      timeouts.push(
        setTimeout(
          () => playGameSound("shuffle", String(id)),
          Math.max(0, lead - elapsed),
        ),
      );
    }
    // Measure the actual corner anchor, including safe responsive sizing.
    const origin = layer.querySelector(".durak-deal-origin")!.getBoundingClientRect();
    const source = {
      x: origin.left + origin.width / 2 - bounds.left,
      y: origin.top + origin.height / 2 - bounds.top,
    };
    layer.querySelectorAll<HTMLElement>("[data-deal-card]").forEach((element) => {
      const beat = Number(element.dataset["dealCard"]);
      const seat = beat % initial.handSizes.length;
      const index = Math.floor(beat / initial.handSizes.length);
      const position =
        DURAK_SEAT_POSITIONS[initial.handSizes.length]?.[
          (seat - initial.seat + initial.handSizes.length) % initial.handSizes.length
        ] ?? "top";
      const target = table
        ?.querySelector(`[data-durak-opponent-seat="${seat}"] .durak-fullscreen-opponent-backs`)
        ?.getBoundingClientRect();
      const x =
        seat === initial.seat
          ? bounds.width * 0.5
          : target
            ? target.left +
              target.width / 2 -
              bounds.left +
              (position === "left" ? 50 : position === "right" ? -50 : 0)
            : bounds.width * 0.5;
      const y =
        seat === initial.seat
          ? bounds.height - 110
          : target
            ? target.top - bounds.top + (position.startsWith("top") ? 45 : 0)
            : 100;
      const STACK_SCATTER_OFFSET = [
        { x: 0, y: 0 },
        { x: -3, y: -2 },
        { x: 3, y: 1 },
        { x: -1, y: 3 },
        { x: 2, y: -2 },
        { x: -2, y: 2 },
      ];
      const STACK_SCATTER_TILT = [-2.5, 3.2, -1.8, 2.2, -3.0, 1.5];
      const scatter = STACK_SCATTER_OFFSET[index % STACK_SCATTER_OFFSET.length]!;
      const tilt = STACK_SCATTER_TILT[index % STACK_SCATTER_TILT.length]!;
      const targetRotation = tilt;
      const dx = x - source.x + scatter.x;
      const dy = y - source.y + scatter.y;
      const distance = Math.hypot(dx, dy);
      const startAt = beat * DURAK_DEAL_STAGGER_MS;
      const duration = timing.handAt - startAt;
      const exitX =
        position === "left"
          ? -origin.width - source.x + scatter.x
          : position === "right"
            ? bounds.width + origin.width - source.x + scatter.x
            : dx;
      const exitY =
        position === "bottom"
          ? bounds.height + origin.height - source.y + scatter.y
          : position.startsWith("top")
            ? -origin.height - source.y + scatter.y
            : dy;
      const finalTransform = `translate(${dx}px, ${dy}px) rotate(${targetRotation}deg)`;

      if (!reduced) {
        timeouts.push(
          setTimeout(
            () => playGameSound("deal", `${id}:${beat}`),
            Math.max(0, startAt + lead - elapsed),
          ),
        );
      }

      const flightFrames: Keyframe[] = [];
      const sampleCount = 8;
      for (let s = 0; s <= sampleCount; s++) {
        const time = s / sampleCount;
        const progress = dealProgress(time);
        const arc = 4 * progress * (1 - progress);
        const px = dx * progress;
        const py = dy * progress - arc * Math.min(26, distance * 0.08);
        const rot = targetRotation * progress + (distance > 0 && progress > 0 && progress < 1 ? Math.sin(Math.PI * progress) * 3 : 0);
        const scale = s === sampleCount ? 1 : 0.92 + 0.08 * progress + 0.16 * arc;
        const shadowY = (2 + 14 * arc).toFixed(1);
        const shadowBlur = (4 + 16 * arc).toFixed(1);
        flightFrames.push({
          transform: `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) scale(${scale.toFixed(3)}) rotate(${rot.toFixed(1)}deg)`,
          filter: `drop-shadow(0px ${shadowY}px ${shadowBlur}px rgba(0,0,0,${(0.3 + 0.18 * arc).toFixed(2)}))`,
          opacity: s === 0 ? 0 : 1,
          offset: (DURAK_DEAL_FLIGHT_MS * time) / duration,
        });
      }
      flightFrames.push({
        transform: finalTransform,
        filter: "drop-shadow(0px 2px 4px rgba(0,0,0,0.32))",
        opacity: 1,
        offset: (timing.exitAt - startAt) / duration,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
      flightFrames.push({
        transform: `translate(${exitX}px, ${exitY}px) rotate(${targetRotation}deg)`,
        filter: "drop-shadow(0px 1px 2px rgba(0,0,0,0.2))",
        opacity: 1,
      });

      animate(
        element,
        reduced
          ? [
              { transform: finalTransform, opacity: 0, offset: 0 },
              { transform: finalTransform, opacity: 1, offset: DURAK_DEAL_FLIGHT_MS / duration },
              {
                transform: finalTransform,
                opacity: 1,
                offset: (timing.exitAt - startAt) / duration,
              },
              { transform: `translate(${exitX}px, ${exitY}px) rotate(${targetRotation}deg)`, opacity: 1 },
            ]
          : flightFrames,
        duration,
        startAt,
        "linear",
      );
    });
    // Real hand surfaces stay mounted/decoded and enter only after the closed piles leave.
    const hand = table?.querySelector<HTMLElement>(".durak-fullscreen-hand-row");
    timeouts.push(
      setTimeout(
        () => handEntrance.current?.(),
        Math.max(0, timing.handAt + lead - elapsed),
      ),
    );
    animate(
      hand ?? null,
      [
        {
          visibility: "hidden",
          transform: "translateY(110%)",
          opacity: reduced ? 0 : 1,
          offset: 0,
        },
        {
          visibility: "visible",
          transform: reduced ? "translateY(6px)" : "translateY(110%)",
          opacity: reduced ? 0 : 1,
          offset: 0.001,
        },
        { visibility: "visible", transform: "translateY(0)", opacity: 1 },
      ],
      DURAK_HAND_ENTRANCE_MS,
      timing.handAt,
      "cubic-bezier(0.22, 1, 0.36, 1)",
    );
    table?.querySelectorAll<HTMLElement>(".durak-fullscreen-opponent-backs").forEach((element) => {
      const position = element.closest("[data-position]")?.getAttribute("data-position") ?? "top";
      const entrance = reduced
        ? "translateY(6px)"
        : position === "left"
          ? "translateX(-100%)"
          : position === "right"
            ? "translateX(100%)"
            : "translateY(-100%)";
      animate(
        element,
        [
          { visibility: "hidden", transform: entrance, opacity: 0, offset: 0 },
          { visibility: "visible", transform: entrance, opacity: 0, offset: 0.001 },
          { visibility: "visible", transform: "translate(0,0)", opacity: 1 },
        ],
        DURAK_HAND_ENTRANCE_MS,
        timing.handAt,
        "cubic-bezier(0.22, 1, 0.36, 1)",
      );
    });
    const stock = table?.querySelector("[data-durak-stock-trump] > *")?.getBoundingClientRect();
    const back = table?.querySelector("[data-durak-stock-back] > *")?.getBoundingClientRect();
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
      "cubic-bezier(0.2, 0.8, 0.2, 1)",
    );
    animate(
      layer.querySelector<HTMLElement>(".durak-deal-trump"),
      [
        { transform: "translate(0, 0) rotate(0deg)" },
        { transform: `translate(${dx}px, ${dy}px) rotate(90deg) scale(${scale})` },
      ],
      DURAK_TRUMP_PLACE_MS,
      timing.placeAt,
      "cubic-bezier(0.16, 1, 0.3, 1)",
    );
    animate(
      layer.querySelector<HTMLElement>(".durak-deal-stock"),
      [
        { transform: "translate(0, 0)", zIndex: 3 },
        { transform: `translate(${bx}px, ${by}px) scale(${backScale})`, zIndex: 6 },
      ],
      DURAK_STOCK_PLACE_MS,
      timing.stockAt,
      "cubic-bezier(0.16, 1, 0.3, 1)",
    );
    const timer = setTimeout(
      () => complete.current(id),
      Math.max(0, id - (initial.dealServerNow ?? id)),
    );
    return () => {
      clearTimeout(timer);
      timeouts.forEach((t) => clearTimeout(t));
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
