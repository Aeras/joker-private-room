import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DurakCardBack } from "./DurakTableVisuals";
import { discardLanding, discardFrames, type DiscardSnapshot as Snapshot } from "./discardGeometry";
import { DURAK_CLEAR_MS, type DurakCollection } from "./useDurakPresentation";

function FlyingDiscard({
  snapshot,
  duration,
  onLand,
  take = false,
  local = false,
}: {
  snapshot: Snapshot;
  duration: number;
  onLand: () => void;
  take?: boolean;
  local?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    face = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current,
      faceNode = face.current;
    if (!node || !faceNode) return;
    faceNode.replaceChildren(snapshot.face.cloneNode(true));
    const flipNode = node.querySelector<HTMLElement>(".durak-discard-flip")!;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const frames = take
      ? [
          { transform: `rotate(${snapshot.rotation}deg)`, offset: 0 },
          {
            transform: `translate(${snapshot.dx * 0.45}px, ${snapshot.dy * 0.45 - 18}px) rotate(3deg) scale(${1 + (snapshot.scale - 1) * 0.45})`,
            offset: 0.45,
          },
          {
            transform: `translate(${snapshot.dx}px, ${snapshot.dy}px) rotate(0deg) scale(${snapshot.scale})`,
            offset: 1,
          },
        ]
      : discardFrames(snapshot);
    let cancelled = false,
      done = false;
    const land = () => {
      if (!cancelled && !done) {
        done = true;
        onLand();
      }
    };
    let movement: Animation | undefined, flip: Animation | undefined;
    const ms = reduced ? 120 : duration;
    if (typeof node.animate === "function") {
      movement = node.animate(frames, {
        duration: ms,
        fill: "forwards",
        ...(take ? { easing: "cubic-bezier(.2,.8,.2,1)" } : {}),
      });
      if (!take || !local)
        flip = flipNode.animate(
          [
            { transform: "rotateY(0deg)", offset: 0 },
            { transform: "rotateY(0deg)", offset: 0.1 },
            { transform: "rotateY(90deg)", offset: 0.25 },
            { transform: "rotateY(180deg)", offset: 0.43 },
            { transform: "rotateY(180deg)", offset: 1 },
          ],
          { duration: ms, fill: "forwards", easing: "ease-in-out" },
        );
      movement.finished.then(land).catch(() => {});
    } else {
      // Native CSS fallback still moves the full measured distance; no opacity substitution.
      node.style.transition = `transform ${ms}ms cubic-bezier(.4,0,.2,1)`;
      if (!take || !local)
        flipNode.style.transition = `transform ${Math.round(ms * 0.43)}ms ease-in-out`;
      node.getBoundingClientRect(); // Commit the initial pose before the fallback transition.
      const id = requestAnimationFrame(() => {
        node.style.transform = String(frames.at(-1)!.transform);
        if (!take || !local) flipNode.style.transform = "rotateY(180deg)";
      });
      node.dataset["fallbackFrame"] = String(id);
    }
    const safety = setTimeout(land, ms + 80);
    return () => {
      cancelled = true;
      clearTimeout(safety);
      movement?.cancel();
      flip?.cancel();
      if (node.dataset["fallbackFrame"])
        cancelAnimationFrame(Number(node.dataset["fallbackFrame"]));
    };
  }, [snapshot, duration, onLand, take, local]);
  return (
    <div
      ref={ref}
      className="durak-discard-flying-card"
      data-discard-flight={take ? undefined : snapshot.index}
      data-take-flight={take ? snapshot.index : undefined}
      style={
        {
          left: snapshot.left,
          top: snapshot.top,
          width: snapshot.width,
          height: snapshot.height,
          "--card-w": `${snapshot.width}px`,
          transform: `rotate(${snapshot.rotation}deg)`,
        } as import("react").CSSProperties
      }
    >
      <div className="durak-discard-flip">
        <div ref={face} className="durak-discard-flight-face" />
        <div className="durak-discard-flight-back">
          <DurakCardBack />
        </div>
      </div>
    </div>
  );
}
export function DurakDiscardFlight({
  collection,
  onLand,
  onComplete,
}: {
  collection: DurakCollection | null;
  onLand: (id: number, index: number) => void;
  onComplete: (id: number) => void;
}) {
  const [capture, setCapture] = useState<{ id: number; root: Element; cards: Snapshot[] } | null>(
    null,
  );
  const callbacks = useRef({ onLand, onComplete });
  callbacks.current = { onLand, onComplete };
  const landed = useRef(new Set<number>());
  const handlers = useRef<Array<() => void>>([]);
  useLayoutEffect(() => {
    if (!collection) {
      setCapture(null);
      return;
    }
    const root = document.querySelector(".durak-fullscreen");
    const mound = root?.querySelector<HTMLElement>(".durak-discard-mound");
    const sources = root?.querySelectorAll<HTMLElement>("[data-durak-pair] .durak-played-card");
    if (
      !root ||
      (!mound && collection.kind !== "take") ||
      !sources ||
      sources.length !== collection.cards.length
    ) {
      callbacks.current.onComplete(collection.id);
      return;
    }
    const local = collection.kind === "take" && collection.receiver === collection.localSeat;
    const destinations = collection.cards.map((card) =>
      collection.kind !== "take"
        ? mound
        : local
          ? root.querySelector<HTMLElement>(`[data-durak-card-key="${card.suit}:${card.rank}"]`)
          : root.querySelector<HTMLElement>(
              `[data-durak-opponent-seat="${collection.receiver}"] .durak-fullscreen-opponent-backs > :last-child`,
            ),
    );
    if (destinations.some((destination) => !destination)) {
      callbacks.current.onComplete(collection.id);
      return;
    }
    const cards = [...sources].map((source, index) => {
      const rect = source.getBoundingClientRect(),
        child = source.firstElementChild as HTMLElement;
      const destination = destinations[index]!;
      const target = destination.getBoundingClientRect();
      const targetWidth = destination.offsetWidth || target.width;
      const width = child?.offsetWidth || rect.width,
        height = child?.offsetHeight || rect.height;
      const rotated = source.closest(".durak-fullscreen-defense") !== null;
      const rotation = rotated ? 12 : 0,
        { x, y, angle } =
          collection.kind === "take"
            ? { x: 0, y: 0, angle: 0 }
            : discardLanding(collection.from + index);
      const left = rect.left + rect.width / 2 - width / 2,
        top = rect.top + rect.height / 2 - height / 2;
      return {
        index,
        left,
        top,
        width,
        height,
        rotation,
        angle,
        dx: target.left + x + targetWidth / 2 - left - width / 2,
        dy: target.top + y + (destination.offsetHeight || target.height) / 2 - top - height / 2,
        scale: targetWidth / width,
        face: child.cloneNode(true),
      };
    });
    landed.current.clear();
    handlers.current = cards.map((_, index) => () => {
      if (landed.current.has(index)) return;
      landed.current.add(index);
      callbacks.current.onLand(collection.id, index);
      if (landed.current.size === cards.length) callbacks.current.onComplete(collection.id);
    });
    setCapture({ id: collection.id, root, cards });
    sources.forEach((source) => {
      source.style.visibility = "hidden";
    });
    return () => {
      sources.forEach((source) => {
        source.style.visibility = "";
      });
    };
  }, [collection]);
  if (!capture || !collection || capture.id !== collection.id) return null;
  return createPortal(
    <div
      className="durak-discard-flight-layer"
      aria-hidden="true"
      data-discard-collection={collection.kind === "take" ? undefined : collection.id}
      data-take-collection={collection.kind === "take" ? collection.id : undefined}
    >
      {capture.cards
        .filter((s) => !landed.current.has(s.index))
        .map((snapshot) => (
          <FlyingDiscard
            key={snapshot.index}
            snapshot={snapshot}
            take={collection.kind === "take"}
            local={collection.receiver === collection.localSeat}
            duration={
              (collection.kind === "take" ? 620 : DURAK_CLEAR_MS) -
              Math.min(80, (capture.cards.length - 1 - snapshot.index) * 10)
            }
            onLand={handlers.current[snapshot.index]!}
          />
        ))}
    </div>,
    capture.root,
  );
}
