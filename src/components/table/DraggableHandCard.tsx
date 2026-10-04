import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cardLabel, type Card } from "@/domain/cards";
import { cn } from "@/lib/utils";
import { PlayingCard } from "../joker/PlayingCard";
import { shouldCommitCardGesture } from "./cardGesture";
import type { RectLike } from "./useTableGeometry";

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startedAt: number;
};

function rectLike(rect: DOMRect): RectLike {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
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
  onCommit,
}: {
  card: Card;
  legal: boolean;
  blocked: boolean;
  pending: boolean;
  authorityKey: string;
  zIndex: number;
  overlap: boolean;
  onCommit: (cardId: string, releaseRect: RectLike) => Promise<void>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const committingRef = useRef(false);
  const canInteract = legal && !blocked && !pending;

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

  const sample = useMemo(() => drag ? {
    deltaX: drag.currentX - drag.startX,
    deltaY: drag.currentY - drag.startY,
    durationMs: performance.now() - drag.startedAt,
  } : null, [drag]);
  const commitReady = sample ? shouldCommitCardGesture(sample) : false;

  const submitOnce = async (releaseRect: RectLike) => {
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
    if (!canInteract || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      startedAt: performance.now(),
    });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    setDrag((current) => current?.pointerId === event.pointerId ? {
      ...current,
      currentX: event.clientX,
      currentY: event.clientY,
    } : current);
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
    const shouldCommit = shouldCommitCardGesture({
      deltaX: event.clientX - current.startX,
      deltaY: event.clientY - current.startY,
      durationMs: performance.now() - current.startedAt,
    });
    if (!shouldCommit) {
      setDrag(null);
      return;
    }
    // Preserve the final dragged pose until the parent creates the presentation token.
    void submitOnce(rectLike(event.currentTarget.getBoundingClientRect()));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canInteract || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    void submitOnce(rectLike(rect));
  };

  const deltaX = drag ? drag.currentX - drag.startX : 0;
  const deltaY = drag ? drag.currentY - drag.startY : 0;

  return (
    <div
      ref={rootRef}
      role="button"
      tabIndex={canInteract ? 0 : -1}
      aria-disabled={!canInteract}
      aria-label={`${cardLabel(card)}${legal ? ", σύρε προς το κέντρο ή πάτησε Enter για παίξιμο" : ", μη επιτρεπτό φύλλο"}`}
      className={cn(
        "relative select-none outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-primary",
        overlap && "-ml-[calc(var(--card-w)*0.36)]",
        legal ? "touch-none" : "opacity-70",
        drag && "z-[100] cursor-grabbing transition-none",
        commitReady && "drop-shadow-[0_0_14px_var(--gold)]",
        pending && "pointer-events-none opacity-0",
      )}
      style={{
        zIndex: drag ? 100 : zIndex,
        transform: drag ? `translate3d(${deltaX}px, ${deltaY}px, 0) rotate(${Math.max(-8, Math.min(8, deltaX / 18))}deg)` : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishPointer(event, false)}
      onPointerCancel={(event) => finishPointer(event, true)}
      onKeyDown={onKeyDown}
    >
      <PlayingCard card={card} selected={commitReady} className={cn(drag && "scale-[1.04]")} />
    </div>
  );
}
