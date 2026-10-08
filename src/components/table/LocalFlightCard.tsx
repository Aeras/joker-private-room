import { TRICK_CARD_ROTATION } from "./trickPresentationModel";
import { recordTimingDiagnostic } from "@/lib/timingDiagnostics";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlayingCard } from "../joker/PlayingCard";
import { playGameSound } from "@/lib/gameAudio";
import type { LocalPlayPresentation } from "./localPlayPresentation";
import type { TableGeometry } from "./useTableGeometry";

export const LOCAL_FLIGHT_MS = 300;
export const REDUCED_LOCAL_FLIGHT_MS = 75;
export const MOTION_FALLBACK_SLACK_MS = 120;

/** Authority confirmation never restarts this mounted flight. */
export function LocalFlightCard({ presentation, geometry, viewerSeat, reducedMotion, onSettled, onLanded }: {
  presentation: LocalPlayPresentation; geometry: TableGeometry; viewerSeat: number;
  reducedMotion: boolean; onSettled: () => void; onLanded?: () => void;
}) {
  const frozen = useRef({ geometry, release: presentation.releaseRect, viewerSeat }).current;
  const [launched, setLaunched] = useState(false);
  const [landed, setLanded] = useState(false);
  const [returned, setReturned] = useState(false);
  const finished = useRef(false);
  const callback = useRef(onSettled); callback.current = onSettled;
  const landingCallback = useRef(onLanded); landingCallback.current = onLanded;
  const duration = reducedMotion ? REDUCED_LOCAL_FLIGHT_MS : LOCAL_FLIGHT_MS;
  const rejected = presentation.status === "rejected";
  const motionCompleted = useRef(new Set<string>());
  const completeMotion = useCallback(() => { const stage = rejected ? "returned" : "landed"; if (motionCompleted.current.has(stage)) return; motionCompleted.current.add(stage); recordTimingDiagnostic("local_flight_" + stage, { cardId: presentation.cardId, durationMs: duration }); if (rejected) setReturned(true); else { landingCallback.current?.(); setLanded(true); } }, [rejected, duration, presentation.cardId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { recordTimingDiagnostic("local_flight_launch", { cardId: presentation.cardId, durationMs: duration }); setLaunched(true); });
    return () => cancelAnimationFrame(frame);
  }, [duration, presentation.cardId]);
  useEffect(() => {
    if (!launched && !rejected) return;
    const timer = window.setTimeout(completeMotion, duration + MOTION_FALLBACK_SLACK_MS);
    return () => window.clearTimeout(timer);
  }, [completeMotion, duration, launched, rejected]);
  useEffect(() => {
    if (finished.current || !(rejected ? returned : landed && presentation.status === "accepted")) return;
    finished.current = true;
    if (!rejected) playGameSound("play", `${presentation.gameId}:${presentation.dealNumber}:local-flight:${presentation.cardId}:${presentation.sourceStateVersion}`);
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
  return <div className="fixed left-0 top-0 z-40 transition-transform ease-out" style={{
    "--card-w": `${width}px`, transitionDuration: `${duration}ms`,
    transform: `translate(${x - width / 2}px, ${y - height / 2}px) rotate(${atTarget ? rotation : frozen.release.rotation ?? 0}deg) scale(${atTarget ? targetWidth / width : 1})`,
  } as React.CSSProperties} data-local-flight-card={presentation.cardId} data-local-flight-status={presentation.status}
    onTransitionEnd={(event) => { if (event.target === event.currentTarget && event.propertyName === "transform") completeMotion(); }}>
    <PlayingCard card={presentation.card} />
  </div>;
}
