import { cardFlightFrames } from "./cardFlightMotion";
import { PresentationRun, presentationTimeout } from "./presentationRun";
import { REDUCED_MOTION_DISTANCE_PX } from "./presentationTiming";
import { NORMAL_FROM_BELOW_FLIP_MS, NORMAL_FROM_BELOW_FLIGHT_MS, TRICK_CARD_ROTATION } from "./trickPresentationModel";
import { recordTimingDiagnostic } from "@/lib/timingDiagnostics";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PlayingCard } from "../joker/PlayingCard";
import { UnderJokerFace } from "./UnderJokerFace";
import { playGameSound } from "@/lib/gameAudio";
import type { LocalPlayPresentation } from "./localPlayPresentation";
import type { TableGeometry } from "./useTableGeometry";

import { LOCAL_FLIGHT_MS, REDUCED_LOCAL_FLIGHT_MS, MOTION_FALLBACK_SLACK_MS } from "./presentationTiming";
export { LOCAL_FLIGHT_MS, REDUCED_LOCAL_FLIGHT_MS, MOTION_FALLBACK_SLACK_MS } from "./presentationTiming";
/** Authority confirmation never restarts this mounted flight. */
export function LocalFlightCard({ presentation, geometry, viewerSeat, reducedMotion, onSettled, onLanded }: {
  presentation: LocalPlayPresentation; geometry: TableGeometry; viewerSeat: number;
  reducedMotion: boolean; onSettled: () => void; onLanded?: () => void;
}) {
  const flightId = "local-flight-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const motionReduced = useRef(reducedMotion).current;
  const frozen = useRef({ geometry, release: presentation.releaseRect, viewerSeat }).current;
  const [launched, setLaunched] = useState(false);
  const [landed, setLanded] = useState(false);
  const [returned, setReturned] = useState(false);
  const finished = useRef(false);
  const callback = useRef(onSettled); callback.current = onSettled;
  const landingCallback = useRef(onLanded); landingCallback.current = onLanded;
  const fromBelow = presentation.jokerSemantic?.context === "OPEN_TRICK" && presentation.jokerSemantic.mode === "FROM_BELOW";
  const duration = motionReduced ? REDUCED_LOCAL_FLIGHT_MS : fromBelow ? NORMAL_FROM_BELOW_FLIGHT_MS : LOCAL_FLIGHT_MS;
  const flipDuration = motionReduced ? REDUCED_LOCAL_FLIGHT_MS : NORMAL_FROM_BELOW_FLIP_MS;
  const rejected = presentation.status === "rejected";
  const motionCompleted = useRef(new Set<string>());
  const completeMotion = useCallback(() => { const stage = rejected ? "returned" : "landed"; if (motionCompleted.current.has(stage)) return; motionCompleted.current.add(stage); recordTimingDiagnostic("local_flight_" + stage, { cardId: presentation.cardId, durationMs: duration }); if (rejected) setReturned(true); else { landingCallback.current?.(); playGameSound("play", `${presentation.gameId}:${presentation.dealNumber}:local-flight:${presentation.cardId}:${presentation.sourceStateVersion}`); setLanded(true); } }, [rejected, duration, presentation.cardId, presentation.gameId, presentation.dealNumber, presentation.sourceStateVersion]);

  useEffect(() => {
    const run = new PresentationRun();
    const frame = requestAnimationFrame(run.guard(() => { recordTimingDiagnostic("local_flight_launch", { cardId: presentation.cardId, durationMs: duration }); setLaunched(true); }));
    return () => { run.invalidate(); cancelAnimationFrame(frame); };
  }, [duration, presentation.cardId]);
  useEffect(() => {
    if (!launched && !rejected) return;
    return presentationTimeout(completeMotion, duration + MOTION_FALLBACK_SLACK_MS);
  }, [completeMotion, duration, launched, rejected]);
  useEffect(() => {
    if (finished.current || !(rejected ? returned : landed && presentation.status === "accepted")) return;
    finished.current = true;
    callback.current();
  }, [landed, presentation, rejected, returned]);

  const pos = (presentation.actorSeat - frozen.viewerSeat + 4) % 4;
  const target = frozen.geometry.trickSlots[pos as 0 | 1 | 2 | 3];
  const atTarget = launched && !rejected;
  const width = frozen.release.cardWidth ?? frozen.release.width;
  // The DOM surface keeps 5:7 aspect; AABB height includes drag rotation.
  const height = width * 7 / 5;
  const rotation = TRICK_CARD_ROTATION[pos as 0 | 1 | 2 | 3];
  const targetWidth = frozen.geometry.trickCardSize.width;
  const x = atTarget ? frozen.geometry.feltRect.left + target.x : frozen.release.left + frozen.release.width / 2;
  const y = atTarget ? frozen.geometry.feltRect.top + target.y : frozen.release.top + frozen.release.height / 2;
  const destinationX = frozen.geometry.feltRect.left + target.x;
  const destinationY = frozen.geometry.feltRect.top + target.y;
  const visualX = motionReduced ? destinationX : x;
  const visualY = motionReduced ? destinationY + (atTarget ? 0 : REDUCED_MOTION_DISTANCE_PX) : y;
  const curved = !motionReduced && !fromBelow && launched && !landed && !rejected;
  const frames = curved ? cardFlightFrames((point, angle, t) => `translate(${point.x - width / 2}px, ${point.y - height / 2}px) rotate(${angle}deg) scale(${1 + (targetWidth / width - 1) * t})`,
    { x: frozen.release.left + frozen.release.width / 2, y: frozen.release.top + frozen.release.height / 2 },
    { x: destinationX, y: destinationY }, frozen.release.rotation ?? 0, rotation) : "";
  return <div className="fixed left-0 top-0 z-40 transition-[transform,opacity] ease-out" style={{
    "--card-w": `${width}px`, opacity: motionReduced && !atTarget ? 0 : 1, transitionDuration: `${duration}ms`,
    ...(curved ? { animationName: flightId, animationDuration: `${duration}ms`, animationTimingFunction: "linear", animationFillMode: "both", transitionProperty: "opacity" } : {}),
    ...(fromBelow ? { transitionTimingFunction: "ease-in-out" } : {}),
    ...(fromBelow && atTarget ? { zIndex: 0, animation: `joker-under-layer ${flipDuration}ms linear both` } : {}),
    transform: `translate(${visualX - width / 2}px, ${visualY - height / 2}px) rotate(${motionReduced || atTarget ? rotation : frozen.release.rotation ?? 0}deg) scale(${motionReduced || atTarget ? targetWidth / width : 1})`,
  } as React.CSSProperties} data-local-flight-card={presentation.cardId} data-local-flight-status={presentation.status}
    onAnimationEnd={(event) => { if (!rejected && event.target === event.currentTarget && event.animationName === flightId) completeMotion(); }}
    onTransitionEnd={(event) => { if (!curved && event.target === event.currentTarget && event.propertyName === "transform") completeMotion(); }}>
    {frames && <style>{`@keyframes ${flightId}{${frames}}`}</style>}
    {fromBelow ? <UnderJokerFace card={presentation.card} flipped={atTarget} duration={flipDuration} reducedMotion={motionReduced} /> : <PlayingCard card={presentation.card} />}
  </div>;
}
