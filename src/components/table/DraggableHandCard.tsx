import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { cardLabel, type Card } from "@/domain/cards";
import { cn } from "@/lib/utils";
import { PlayingCard } from "../joker/PlayingCard";
import { shouldCommitCardGesture, shouldCommitCardRelease } from "./cardGesture";
import type { CardReleaseRect, RectLike } from "./useTableGeometry";

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startedAt: number;
  pointerType: string;
};

function releasePose(element: HTMLDivElement, rotation = 0): CardReleaseRect {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {
    left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
    width: rect.width, height: rect.height,
    cardWidth: Number.parseFloat(style.width) || element.offsetWidth || rect.width,
    cardHeight: Number.parseFloat(style.height) || element.offsetHeight || rect.height,
    rotation,
  };
}

export function DraggableHandCard({
  card,
  legal,
  blocked,
  pending,
  authorityKey,
  zIndex,
  overlap,
  revealing = false,
  faceUpOnReveal = false,
  dropRect,
  onCommit,
}: {
  card: Card;
  legal: boolean;
  blocked: boolean;
  pending: boolean;
  authorityKey: string;
  zIndex: number;
  overlap: boolean;
  revealing?: boolean;
  faceUpOnReveal?: boolean;
  dropRect?: RectLike | null;
  onCommit: (cardId: string, releaseRect: CardReleaseRect) => Promise<void>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const committingRef = useRef(false);
  const canInteract = legal && !blocked && !pending && !revealing;
  const [faceVisible, setFaceVisible] = useState(!revealing || faceUpOnReveal);
  useLayoutEffect(() => {
    if (!revealing || faceUpOnReveal) {
      setFaceVisible(true);
      return;
    }
    setFaceVisible(false);
    // Rise begins after two paint frames; reveal follows it, not the mount.
    const timer = window.setTimeout(() => setFaceVisible(true), 190 + zIndex * 22);
    const finish = () => { window.clearTimeout(timer); setFaceVisible(true); };
    window.addEventListener("blur", finish);
    window.addEventListener("orientationchange", finish);
    document.addEventListener("visibilitychange", finish);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("blur", finish);
      window.removeEventListener("orientationchange", finish);
      document.removeEventListener("visibilitychange", finish);
    };
  }, [revealing, faceUpOnReveal, card.id, zIndex]);

  useEffect(() => {
    setDrag(null);
    committingRef.current = false;
  }, [authorityKey]);

  useEffect(() => {
    const cancel = () => setDrag(null);
    const visibility = () => {
      if (document.visibilityState !== "visible") cancel();
    };
    window.addEventListener("orientationchange", cancel);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("orientationchange", cancel);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  const sample = useMemo(
    () =>
      drag
        ? {
            deltaX: drag.currentX - drag.startX,
            deltaY: drag.currentY - drag.startY,
            durationMs: performance.now() - drag.startedAt,
          }
        : null,
    [drag],
  );
  const commitReady = drag
    ? shouldCommitCardRelease({
        pointerType: drag.pointerType,
        clientX: drag.currentX,
        clientY: drag.currentY,
        dropRect: dropRect ?? null,
        gesture: sample ?? { deltaX: 0, deltaY: 0, durationMs: 0 },
      })
    : false;

  const submitOnce = async (releaseRect: CardReleaseRect) => {
    if (!canInteract || committingRef.current) return;
    committingRef.current = true;
    try {
      await onCommit(card.id, releaseRect);
    } finally {
      committingRef.current = false;
      setDrag(null);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canInteract || event.button !== 0 || event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      startedAt: performance.now(),
      pointerType: event.pointerType,
    });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    setDrag((current) =>
      current?.pointerId === event.pointerId
        ? {
            ...current,
            currentX: event.clientX,
            currentY: event.clientY,
          }
        : current,
    );
  };

  const finishPointer = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const current = drag;
    if (!current || current.pointerId !== event.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser/OS.
    }
    if (cancelled || !canInteract) {
      setDrag(null);
      return;
    }
    const shouldCommit = shouldCommitCardRelease({
      pointerType: current.pointerType,
      clientX: event.clientX,
      clientY: event.clientY,
      dropRect: dropRect ?? null,
      gesture: {
        deltaX: event.clientX - current.startX,
        deltaY: event.clientY - current.startY,
        durationMs: performance.now() - current.startedAt,
      },
    });
    if (!shouldCommit) {
      setDrag(null);
      return;
    }
    // Preserve the final dragged pose until the parent creates the presentation token.
    void submitOnce(releasePose(event.currentTarget, Math.max(-8, Math.min(8, (current.currentX - current.startX) / 18))));
  };

  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!canInteract || event.button !== 0) return;
    event.preventDefault();
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    void submitOnce(releasePose(rootRef.current!));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canInteract || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    void submitOnce(releasePose(rootRef.current!));
  };

  const deltaX = drag ? drag.currentX - drag.startX : 0;
  const deltaY = drag ? drag.currentY - drag.startY : 0;

  return (
    <div
      ref={rootRef}
      role="button"
      tabIndex={canInteract ? 0 : -1}
      aria-disabled={!canInteract}
      aria-label={`${cardLabel(card)}${legal ? ", σε υπολογιστή διπλό κλικ, σε αφή σύρε προς το κέντρο ή πάτησε Enter για παίξιμο" : ", μη επιτρεπτό φύλλο"}`}
      className={cn(
        "relative select-none outline-none transition-[transform,margin-left] duration-[520ms] focus-visible:ring-2 focus-visible:ring-primary",
        overlap && "-ml-[calc(var(--card-w)*var(--card-overlap))]",
        legal && "touch-none cursor-grab",
        drag && "z-[100] cursor-grabbing transition-none",
        commitReady && "drop-shadow-[0_0_14px_var(--gold)]",
        pending && "pointer-events-none opacity-0",
      )}
      style={{
        zIndex: drag ? 100 : zIndex,
        transform: drag
          ? `translate3d(${deltaX}px, ${deltaY}px, 0) rotate(${Math.max(-8, Math.min(8, deltaX / 18))}deg)`
          : undefined,
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishPointer(event, false)}
      onPointerCancel={(event) => finishPointer(event, true)}
      onKeyDown={onKeyDown}
    >
      <div className="[perspective:900px]" data-hand-card={card.id} data-hand-revealing={revealing} data-hand-flip-delay={faceUpOnReveal ? 0 : 190 + zIndex * 22}>
        <div
          className="relative transition-transform duration-[340ms] motion-reduce:duration-75 [transform-style:preserve-3d]"
          style={{ transform: `rotateY(${faceVisible ? 0 : 180}deg)`, transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
        >
          <div className="[backface-visibility:hidden]">
            <PlayingCard
              card={card}
              selected={commitReady}
              className={cn(drag && "scale-[1.04]")}
            />
          </div>
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <PlayingCard faceDown />
          </div>
        </div>
      </div>
    </div>
  );
}
