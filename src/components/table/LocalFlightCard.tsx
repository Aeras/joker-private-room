import { useCallback, useEffect, useRef, useState } from "react";
import { PlayingCard } from "../joker/PlayingCard";
import { playGameSound } from "@/lib/gameAudio";
import type { LocalPlayPresentation } from "./localPlayPresentation";
import type { TableGeometry } from "./useTableGeometry";

export const LOCAL_FLIGHT_MS = 300;
export const REDUCED_LOCAL_FLIGHT_MS = 75;
export const MOTION_FALLBACK_SLACK_MS = 120;

/** Authority confirmation never restarts this mounted flight. */
export function LocalFlightCard({ presentation, geometry, viewerSeat, reducedMotion, onSettled }: {
  presentation: LocalPlayPresentation; geometry: TableGeometry; viewerSeat: number;
  reducedMotion: boolean; onSettled: () => void;
}) {
  const frozen = useRef({ geometry, release: presentation.releaseRect, viewerSeat }).current;
  const [launched, setLaunched] = useState(false);
  const [landed, setLanded] = useState(false);
  const [returned, setReturned] = useState(false);
  const finished = useRef(false);
  const callback = useRef(onSettled); callback.current = onSettled;
  const duration = reducedMotion ? REDUCED_LOCAL_FLIGHT_MS : LOCAL_FLIGHT_MS;
  const rejected = presentation.status === "rejected";
  const completeMotion = useCallback(() => { if (rejected) setReturned(true); else setLanded(true); }, [rejected]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setLaunched(true));
    return () => cancelAnimationFrame(frame);
  }, []);
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
  const width = frozen.release.width;
  const height = frozen.release.height;
  const rotation = [2, -7, -2, 7][pos] ?? 0;
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const targetWidth = useRef(Math.max(3 * rem, Math.min(window.innerWidth * 0.06, 5 * rem))).current;
  const x = atTarget ? frozen.geometry.feltRect.left + target.x : frozen.release.left + width / 2;
  const y = atTarget ? frozen.geometry.feltRect.top + target.y : frozen.release.top + height / 2;
  return <div className="fixed left-0 top-0 z-40 transition-transform ease-out" style={{
    "--card-w": `${width}px`, transitionDuration: `${duration}ms`,
    transform: `translate(${x - width / 2}px, ${y - height / 2}px) rotate(${atTarget ? rotation : 0}deg) scale(${atTarget ? targetWidth / width : 1})`,
  } as React.CSSProperties} data-local-flight-card={presentation.cardId} data-local-flight-status={presentation.status}
    onTransitionEnd={(event) => { if (event.target === event.currentTarget && event.propertyName === "transform") completeMotion(); }}>
    <PlayingCard card={presentation.card} />
  </div>;
}
