import {useCanvasArtwork} from "./canvas/useCanvasArtwork";
import { HAND_LANDING_EASING } from "./dealtCardMotion";
import { useReducedMotion } from "./useReducedMotion";
import { HAND_REVEAL_SPREAD_MS, REDUCED_MOTION_DISTANCE_PX } from "./presentationTiming";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { assets } from "@/assets/registry";
import { CanvasPresentation, type PresentationSprite } from "./canvas/CanvasPresentation";
import { handTrackPose, updateHandTrack, type HandTrack, type HandVisual } from "./canvas/handSceneMotion";
import { HAND_REFLOW_MS } from "./presentationTiming";
import type { Card } from "@/domain/cards";
import { LOCAL_HAND_ENTRANCE_MS } from "./dealPresentationModel";
import { useHandReflow } from "./useHandReflow";
import { DraggableHandCard } from "./DraggableHandCard";
import { localHandCenterOffset } from "./tableControlModel";
import type { CardReleaseRect, TableGeometry } from "./useTableGeometry";

export function LocalHandRow({
  cards,
  summary,
  visible,
  legalCardIds,
  blocked,
  pendingCardId,
  authorityKey,
  presentationScope,
  geometry,
  revealing = false,
  onCommit,
}: {
  summary?: React.ReactNode;
  cards: readonly Card[];
  visible: boolean;
  legalCardIds: readonly string[];
  blocked: boolean;
  pendingCardId: string | null;
  authorityKey: string;
  presentationScope?:string;
  geometry: TableGeometry | null;
  revealing?: boolean;
  onCommit: (cardId: string, releaseRect: CardReleaseRect) => Promise<void>;
}) {
  const reduced = useReducedMotion();
  const scope=visible?presentationScope??authorityKey.split(":")[0]??authorityKey:null;
  const prepared=useCanvasArtwork(visible?[assets.cardBack,...cards.map(card=>assets.cardFace(card))]:[],scope);
  const [failedScope,setFailedScope]=useState<string|null>(null);
  const canvasOwned=Boolean(visible&&geometry&&prepared===true&&scope!==failedScope);
  const tracks=useRef(new Map<string,HandTrack>());
  const inputTargets=useRef(new Map<string,{element:HTMLElement;center:{x:number;y:number}}>());
  const trackScope=useRef(scope);
  if(trackScope.current!==scope){tracks.current.clear();inputTargets.current.clear();trackScope.current=scope;}
  const [visualRevision,reviseVisual]=useState(0);
  const wasVisible=useRef(visible),visibleAt=useRef(performance.now());
  if(visible&&!wasVisible.current)visibleAt.current=performance.now();wasVisible.current=visible;
  const emitVisual=useCallback((visual:HandVisual)=>{
    if(!(visual.pose.width>0&&visual.pose.height>0))return;
    if(visual.hitTarget&&visual.logicalCenter)inputTargets.current.set(visual.id,{element:visual.hitTarget,center:visual.logicalCenter});
    const now=performance.now(),old=tracks.current.get(visual.id);
    const duration=reduced?75:revealing?Math.max(0,LOCAL_HAND_ENTRANCE_MS-(now-visibleAt.current)):HAND_REFLOW_MS;
    const next=updateHandTrack(old,visual,now,duration,reduced?75:340);
    if(!old&&revealing&&duration>0) next.position={...next.position,from:{...next.position.from,y:next.position.from.y+(reduced?12:next.position.from.height),opacity:reduced?0:1},duration,landing:true};
    tracks.current.set(visual.id,next);reviseVisual(n=>n+1);
  },[revealing,reduced]);
  const legal = new Set(legalCardIds);
  const [entranceSettled, setEntranceSettled] = useState(visible && !revealing);
  const entered = useRef(visible && !revealing);
  useLayoutEffect(() => {
    if (!visible) {
      entered.current = false;
      setEntranceSettled(false);
      return;
    }
    if (entered.current) return;
    setEntranceSettled(false);
    let second: number | undefined;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => { entered.current = true; setEntranceSettled(true); });
    });
    return () => {
      cancelAnimationFrame(first);
      if (second != null) cancelAnimationFrame(second);
    };
  }, [visible]);
  const offset = localHandCenterOffset(geometry);
  const laneWidth = geometry?.localHandBounds?.width;
  const cardWidth = "var(--desktop-hand-card-w, clamp(3.23rem, min(9.12vw, 20.9vh), 6.4125rem))";
  // Detach only from presentation immediately; the canonical hand stays server-owned.
  const presentedCards = cards.filter(card => card.id !== pendingCardId);
  const cardOverlap = presentedCards.length <= 3 ? 0.18 : presentedCards.length <= 5 ? 0.28 : presentedCards.length <= 7 ? 0.36 : 0.42;
  const revealOverlap = reduced || entranceSettled ? cardOverlap : 0.86;

  const handLayoutRef = useHandReflow(JSON.stringify(presentedCards.map(card => card.id)), !canvasOwned && visible && entranceSettled && !revealing);
  const layoutEpoch=JSON.stringify([presentedCards.map(card=>card.id),geometry?.epoch,entranceSettled,canvasOwned]);
  const now=performance.now();
  const sprites:PresentationSprite[]=canvasOwned?presentedCards.flatMap((card,index)=>{
    const track=tracks.current.get(card.id);if(!track)return[];
    return[{id:card.id,url:assets.cardFace(card)!,backUrl:assets.cardBack,layer:track.dragging?100:index,phase:`${track.revision}:${legal.has(card.id)}:${legalCardIds.length>0}:${revealing}`,duration:Math.max(0,track.position.at+track.position.duration-now,track.flip.at+track.flip.duration-now),
      sample:()=>{
        const pose={...handTrackPose(track,performance.now()),shade:legalCardIds.length>0&&!legal.has(card.id)&&!revealing? .3:0};
        const input=inputTargets.current.get(card.id);
        if(input?.element.isConnected){const x=pose.x-input.center.x,y=pose.y-input.center.y;input.element.style.transform=`translate3d(${x}px,${y}px,0)`;input.element.dataset["canvasHitX"]=String(x);input.element.dataset["canvasHitY"]=String(y);}
        return pose;
      }}];
  }):[];

  return (
    <div className="relative w-full" style={{ "--card-w": cardWidth, minHeight: "calc(var(--card-w) * 1.4 + 8px)", transform: `translateX(${offset}px)` } as React.CSSProperties}>
      {summary && <div data-local-hand-summary data-summary-position="above-hand" className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap" style={{ bottom: "calc(100% - var(--card-w) * .52 + .25rem)" }}>{summary}</div>}
    <div
      ref={handLayoutRef}
      className="absolute inset-x-0 bottom-0 flex w-full items-end justify-center px-3 transition-[transform,opacity]"
      style={{
        "--card-w": cardWidth,
        transform: `translateY(${entranceSettled ? "calc(var(--card-w) * 0.52 + 0px)" : reduced ? `calc(var(--card-w) * 0.52 + ${REDUCED_MOTION_DISTANCE_PX}px)` : "calc(100% + max(.15rem, env(safe-area-inset-bottom)) + 2px)"})`,
        opacity: reduced && !entranceSettled ? 0 : 1,
        transitionDuration: canvasOwned?"0ms":`${LOCAL_HAND_ENTRANCE_MS}ms`,
        transitionTimingFunction: reduced ? "linear" : HAND_LANDING_EASING,
      } as React.CSSProperties}
      data-hand-center-offset={offset}
      data-hand-entrance={!entranceSettled ? "entering" : "settled"}
    >
      <div
        className="flex justify-center overflow-visible pt-2"
        style={{ "--card-w": cardWidth, "--card-overlap": revealOverlap } as React.CSSProperties}
        data-hand-lane-width={laneWidth}
        data-hand-final-overlap={cardOverlap}
        data-hand-current-overlap={revealOverlap}
      >
        {visible ? (
          presentedCards.map((card, index) => (
            <div key={card.id} style={{ transitionDuration: canvasOwned?"0ms":revealing || !entranceSettled ? `${HAND_REVEAL_SPREAD_MS}ms` : undefined }} data-hand-layout-card={card.id} className={`relative shrink-0 ${index > 0 ? "-ml-[calc(var(--card-w)*var(--card-overlap))]" : ""} ${revealing || !entranceSettled ? "transition-[margin-left] " : ""}`}>
            <DraggableHandCard
              card={card}
              legal={legal.has(card.id)}
              showLegality={legalCardIds.length > 0}
              blocked={blocked}
              revealing={revealing}
              pending={pendingCardId === card.id}
              authorityKey={authorityKey}
              zIndex={index}
              overlap={false}
              dropRect={geometry?.feltRect ?? null}
              onCommit={onCommit}
              canvasOwned={canvasOwned}
              onVisualChange={emitVisual}
              layoutEpoch={layoutEpoch}
            />
            </div>
          ))
        ) : (
          <div className="rounded-lg bg-black/65 px-4 py-2 text-xs text-white/65">
            Τα φύλλα σου δεν είναι ακόμη ορατά.
          </div>
        )}
      </div>
    </div>
    {canvasOwned&&createPortal(<div className="pointer-events-none fixed inset-0 z-40"><CanvasPresentation key={scope??"hand"} name="hand" sprites={sprites} onFailure={()=>setFailedScope(scope)}/></div>,document.fullscreenElement??document.getElementById("table-fullscreen-root")??document.body)}
    <span hidden data-hand-canvas-revision={visualRevision}/>
    </div>
  );
}
