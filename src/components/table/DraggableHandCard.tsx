import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { cardLabel, type Card } from "@/domain/cards";
import { cn } from "@/lib/utils";
import { PlayingCard } from "../joker/PlayingCard";
import { shouldCommitCardGesture, shouldCommitCardRelease } from "./cardGesture";
import type { CardReleaseRect, RectLike } from "./useTableGeometry";
import type { HandVisual } from "./canvas/handSceneMotion";
import type { SpritePose } from "./canvas/types";
import { LOCAL_HAND_FLIP_MS } from "./presentationTiming";

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
function releaseFromVisual(pose: SpritePose): CardReleaseRect {
  const angle = pose.rotation * Math.PI / 180;
  const width = Math.abs(Math.cos(angle)) * pose.width + Math.abs(Math.sin(angle)) * pose.height;
  const height = Math.abs(Math.sin(angle)) * pose.width + Math.abs(Math.cos(angle)) * pose.height;
  return { left: pose.x-width/2, right: pose.x+width/2, top: pose.y-height/2, bottom: pose.y+height/2,
    width, height, cardWidth: pose.width, cardHeight: pose.height, rotation: pose.rotation };
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
  showLegality = true,
  dropRect,
  onCommit,
  canvasOwned = false,
  onVisualChange,
  onGetVisualPose,
  layoutEpoch,
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
  showLegality?: boolean;
  dropRect?: RectLike | null;
  onCommit: (cardId: string, releaseRect: CardReleaseRect) => Promise<void>;
  canvasOwned?:boolean;
  onVisualChange?: (visual:HandVisual)=>void;
  onGetVisualPose?: (id:string)=>SpritePose|null;
  layoutEpoch?:string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragFrame = useRef<number | null>(null);
  const visualBase = useRef<{center:{x:number;y:number};width:number;height:number;target:HTMLElement}|null>(null);
  const dragOrigin = useRef<SpritePose|null>(null);
  const cancelDragFrame = () => { if(dragFrame.current!==null){cancelAnimationFrame(dragFrame.current);dragFrame.current=null;} };
  const committingRef = useRef(false);
  const canInteract = legal && !blocked && !pending && !revealing;
  // A Joker gesture only opens the semantic chooser; the card never moves until a choice is made.
  const stationary = card.kind === "joker";
  const [faceVisible, setFaceVisible] = useState(!revealing || faceUpOnReveal);
  useLayoutEffect(() => {
    if (!revealing || faceUpOnReveal) {
      setFaceVisible(true);
      return;
    }
    setFaceVisible(false);
    // Rise begins after two paint frames; reveal follows it, not the mount.
    const timer = window.setTimeout(() => setFaceVisible(true), 125 + zIndex * 16);
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
    cancelDragFrame(); dragRef.current=null; dragOrigin.current=null;
    setDrag(null);
    committingRef.current = false;
  }, [authorityKey]);

  useEffect(() => {
    const cancel = () => {cancelDragFrame();dragRef.current=null;dragOrigin.current=null;setDrag(null);};
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
    if(canvasOwned) dragOrigin.current=onGetVisualPose?.(card.id)??null;
    const start={
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      startedAt: performance.now(),
      pointerType: event.pointerType,
    };
    dragRef.current=start;
    setDrag(start);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if(canvasOwned){
      const current=dragRef.current;
      if(!current||current.pointerId!==event.pointerId)return;
      dragRef.current={...current,currentX:event.clientX,currentY:event.clientY};
      if(dragFrame.current===null)dragFrame.current=requestAnimationFrame(()=>{dragFrame.current=null;setDrag(dragRef.current);});
      return;
    }
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
    const current = canvasOwned?dragRef.current:drag;
    if (!current || current.pointerId !== event.pointerId) return;
    cancelDragFrame();dragRef.current=null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser/OS.
    }
    if (cancelled || !canInteract) {
      dragOrigin.current=null;
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
      dragOrigin.current=null;
      setDrag(null);
      return;
    }
    // Finish the pointer-up/capture lifecycle before mounting a Joker chooser.
    // Otherwise the chooser can appear during the same touch gesture and its first tap may be swallowed.
    const deltaX=event.clientX-current.startX;
    // The flight must begin at the last visible Canvas pose, even if pointer-up
    // arrived before its last move could be painted.
    const visual=canvasOwned?onGetVisualPose?.(card.id):null;
    const finalPose=visual?releaseFromVisual(visual):stationary?releasePose(event.currentTarget):releasePose(event.currentTarget,Math.max(-8,Math.min(8,deltaX/18)));
    dragOrigin.current=null;
    if(stationary) window.requestAnimationFrame(() => { void submitOnce(finalPose); });
    else void submitOnce(finalPose);
  };

  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!canInteract || event.button !== 0) return;
    event.preventDefault();
    if (!rootRef.current) return;
    const visual=canvasOwned?onGetVisualPose?.(card.id):null;
    void submitOnce(visual?releaseFromVisual(visual):releasePose(rootRef.current));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canInteract || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    if (!rootRef.current) return;
    const visual=canvasOwned?onGetVisualPose?.(card.id):null;
    void submitOnce(visual?releaseFromVisual(visual):releasePose(rootRef.current));
  };

  const deltaX = drag ? drag.currentX - drag.startX : 0;
  const deltaY = drag ? drag.currentY - drag.startY : 0;
  useLayoutEffect(()=>{
    const element=rootRef.current;if(!canvasOwned||!element)return;
    const rect=element.getBoundingClientRect(),style=getComputedStyle(element),hitTarget=element.parentElement!;
    const hitX=Number(hitTarget.dataset["canvasHitX"]??0),hitY=Number(hitTarget.dataset["canvasHitY"]??0);
    visualBase.current={center:{x:rect.left+rect.width/2-hitX,y:rect.top+rect.height/2-hitY},width:parseFloat(style.width)||rect.width,height:parseFloat(style.height)||rect.height,target:hitTarget};
  },[canvasOwned,layoutEpoch,card.id]);
  useLayoutEffect(()=>{
    const base=visualBase.current;if(!canvasOwned||!base||!onVisualChange)return;
    const origin=drag&&dragOrigin.current?dragOrigin.current:null;
    const center=origin??base.center;
    onVisualChange({id:card.id,index:zIndex,faceUp:faceVisible,dragging:Boolean(drag&&!stationary),revealing,hitTarget:base.target,logicalCenter:base.center,pose:{x:center.x+(drag&&!stationary?deltaX:0),y:center.y+(drag&&!stationary?deltaY:0),
      width:base.width*(drag&&!stationary?1.04:1),height:base.height*(drag&&!stationary?1.04:1),rotation:drag&&!stationary?Math.max(-8,Math.min(8,deltaX/18)):0,opacity:pending?0:1,flip:faceVisible?0:180,emphasis:commitReady&&!stationary?1:0}});
  },[canvasOwned,onVisualChange,card.id,zIndex,faceVisible,drag,stationary,deltaX,deltaY,pending,layoutEpoch,commitReady,revealing]);
  useLayoutEffect(()=>{const target=rootRef.current?.parentElement;return()=>{if(target){target.style.transform="";target.style.zIndex="";delete target.dataset["canvasHitX"];delete target.dataset["canvasHitY"];}};},[canvasOwned]);

  return (
    <div
      ref={rootRef}
      data-hand-illegal={showLegality && !legal && !revealing ? "true" : "false"}
      role="button"
      tabIndex={canInteract ? 0 : -1}
      aria-disabled={!canInteract}
      aria-label={`${cardLabel(card)}${legal ? ", σε υπολογιστή διπλό κλικ, σε αφή σύρε προς το κέντρο ή πάτησε Enter για παίξιμο" : ", μη επιτρεπτό φύλλο"}`}
      className={cn(
        "relative select-none outline-none transition-[transform,margin-left] duration-[520ms] focus-visible:ring-2 focus-visible:ring-primary",
        overlap && "-ml-[calc(var(--card-w)*var(--card-overlap))]",
        legal && "touch-none cursor-grab",
        drag && !stationary && "z-[100] cursor-grabbing transition-none",
        commitReady && !stationary && "drop-shadow-[0_0_14px_var(--gold)]",
        pending && "pointer-events-none opacity-0",
      )}
      style={{
        transition:canvasOwned?"none":undefined,
        zIndex: drag && !stationary ? 100 : zIndex,
        transform: !canvasOwned && drag && !stationary
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
      <div style={{visibility:canvasOwned?"hidden":undefined}} className="[perspective:900px]" data-hand-card={card.id} data-hand-revealing={revealing} data-hand-flip-delay={faceUpOnReveal ? 0 : 190 + zIndex * 22}>
        <div
          className="relative transition-transform motion-reduce:duration-75 [transform-style:preserve-3d]"
          style={{ transform: `rotateY(${faceVisible ? 0 : 180}deg)`, transitionDuration:canvasOwned?"0ms":`${LOCAL_HAND_FLIP_MS}ms`,transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
        >
          <div className="relative [backface-visibility:hidden]">
            <PlayingCard
              card={card}
              selected={commitReady && !stationary}
              className={cn(drag && !stationary && "scale-[1.04]", showLegality && !legal && !revealing && "grayscale-[0.65]")}
            />
            {showLegality && !legal && !revealing && <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] bg-black/30" />}
          </div>
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <PlayingCard faceDown />
          </div>
        </div>
      </div>
    </div>
  );
}
