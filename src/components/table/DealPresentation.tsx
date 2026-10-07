import { assets } from "@/assets/registry";
import { useCriticalCardArtwork } from "./useCriticalCardArtwork";
import { markPresentationCompleted } from "./presentationCompletion";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { nextSeat, type SeatIndex } from "@/domain/dealing";
import type { PlayerGameProjection } from "@/domain/projection";
import { playGameSound } from "@/lib/gameAudio";
import { recordTimingDiagnostic, startTimingDiagnosticSession } from "@/lib/timingDiagnostics";
import { PlayingCard } from "../joker/PlayingCard";
import {
  NORMAL_DEAL_TRAVEL_MS,
  NORMAL_DEAL_SETTLE_MS,
  dealPresentationStageKey,
  dealPresentationStorageKey,
  dealPresentationTiming,
  dealPresentationWasCompleted,
} from "./dealPresentationModel";
import type { Point, TableGeometry, VisualSeat } from "./useTableGeometry";

type DealBeat = { id: string; seat: SeatIndex; index: number; stackIndex: number };
export type DealPresentationStage = "initial" | "remaining" | "full";
export const NINE_CARD_TRUMP_ANNOUNCEMENT_LEAD_IN_MS = 1_800;
const FALLBACK_TARGET: Record<VisualSeat, string> = { 0: "translate(-50%, 22vh)", 1: "translate(-26vw, -50%)", 2: "translate(-50%, -22vh)", 3: "translate(26vw, -50%)" };
const SEAT_ROTATION: Record<VisualSeat, number> = { 0: 0, 1: 90, 2: 180, 3: -90 };
const FALLBACK_DEALER_SOURCE: Record<VisualSeat, { left: string; top: string }> = {
  0: { left: "12%", top: "91%" },
  1: { left: "5%", top: "50%" },
  2: { left: "50%", top: "7%" },
  3: { left: "95%", top: "50%" },
};
function stageFor(projection: PlayerGameProjection): DealPresentationStage | null {
  if (projection.progression.phase === "DEAL_SETUP" || projection.progression.phase === "DEAL_PRESENTATION") return "full";
  if (projection.progression.cardsPerPlayer === 9 && projection.rulesetId !== "classic") {
    if (projection.progression.phase === "NINE_CARD_INITIAL_DEAL_ALL_SEATS") return "initial";
    if (projection.progression.phase === "NINE_CARD_REMAINING_DEAL") return "remaining";
    return null;
  }
  if (projection.progression.phase === "DECLARATION") return "full";
  return null;
}
function recipientFor(dealerSeat: SeatIndex, beatIndex: number): SeatIndex { return nextSeat(nextSeat(dealerSeat), beatIndex % 4); }
function visualPosition(viewerSeat: SeatIndex, seat: SeatIndex): VisualSeat { return ((seat - viewerSeat + 4) % 4) as VisualSeat; }
function viewportPoint(geometry: TableGeometry, local: Point): Point { return { x: geometry.feltRect.left + local.x, y: geometry.feltRect.top + local.y }; }
function stackedTarget(base: Point, pos: VisualSeat, stackIndex: number): Point { const offset = stackIndex * 6; if (pos === 3) return { x: base.x - offset, y: base.y + stackIndex * 2 }; if (pos === 1) return { x: base.x + offset, y: base.y + stackIndex * 2 }; return { x: base.x + offset, y: base.y + stackIndex * 2 }; }
function pointTowardCenter(origin: Point, center: Point, distance: number): Point {
  const dx = center.x - origin.x;
  const dy = center.y - origin.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: origin.x + (dx / length) * distance, y: origin.y + (dy / length) * distance };
}
function dealerSourcePoint(geometry: TableGeometry, dealerPos: VisualSeat): Point {
  const origin = geometry.seatOrigins[dealerPos];
  const inward = pointTowardCenter(origin, geometry.dealCenter, Math.max(24, Math.min(44, geometry.trickCardSize.height * 0.42)));
  return viewportPoint(geometry, inward);
}
function markPresented(stageKey: string): void { markPresentationCompleted(dealPresentationStorageKey(stageKey)); }
function DealerDeckStack({ geometry, dealerPos, settling }: { geometry: TableGeometry | null; dealerPos: VisualSeat; settling: boolean }) {
  const rotation = SEAT_ROTATION[dealerPos];
  if (!geometry) {
    const fallback = FALLBACK_DEALER_SOURCE[dealerPos];
    return <div data-dealer-deck-stack data-dealer-pos={dealerPos} className="absolute [--card-w:clamp(3.4rem,8vw,5.5rem)]" style={{ opacity: settling ? 0 : 1, transition: `opacity ${NORMAL_DEAL_SETTLE_MS}ms ease-out`, left: fallback.left, top: fallback.top, transform: `translate(-50%, -50%) rotate(${rotation}deg)`, zIndex: 28 }}>
      {[2, 1, 0].map((layer) => <div key={layer} className="absolute left-0 top-0" style={{ transform: `translate(${layer * 3}px, ${layer * -2}px)` }}><PlayingCard faceDown /></div>)}
    </div>;
  }
  const source = dealerSourcePoint(geometry, dealerPos);
  return <div data-dealer-deck-stack data-dealer-pos={dealerPos} className="absolute [--card-w:clamp(3.4rem,8vw,5.5rem)]" style={{ opacity: settling ? 0 : 1, transition: `opacity ${NORMAL_DEAL_SETTLE_MS}ms ease-out`, left: source.x, top: source.y, transform: `translate(-50%, -50%) rotate(${rotation}deg)`, zIndex: 28 }}>
    {[2, 1, 0].map((layer) => <div key={layer} className="absolute left-0 top-0" style={{ transform: `translate(${layer * 3}px, ${layer * -2}px)` }}><PlayingCard faceDown /></div>)}
  </div>;
}
function TravelingBack({ beat, pos, geometry, dealerPos, settling }: { beat: DealBeat; pos: VisualSeat; geometry: TableGeometry | null; dealerPos: VisualSeat; settling: boolean }) {
  const [arrived, setArrived] = useState(false);
  useLayoutEffect(() => { setArrived(false); const frame = window.requestAnimationFrame(() => setArrived(true)); return () => window.cancelAnimationFrame(frame); }, [beat.id]);
  const sourceRotation = SEAT_ROTATION[dealerPos];
  const targetRotation = SEAT_ROTATION[pos];
  if (!geometry) {
    const fallback = FALLBACK_DEALER_SOURCE[dealerPos];
    return <div data-deal-traveling-card data-deal-visual-seat={pos} className="absolute [--card-w:clamp(3.4rem,8vw,5.5rem)] transition-[transform,opacity] ease-out" style={{ opacity: settling ? 0 : 1, left: fallback.left, top: fallback.top, zIndex: 30 + beat.stackIndex, transitionDuration: `${settling ? NORMAL_DEAL_SETTLE_MS : NORMAL_DEAL_TRAVEL_MS}ms`, transform: arrived ? `${FALLBACK_TARGET[pos]} ${settling ? ["translateY(12vh)", "translateX(-15vw)", "translateY(-15vh)", "translateX(15vw)"][pos] : ""} rotate(${targetRotation}deg)` : `translate(-50%, -50%) scale(.58) rotate(${sourceRotation}deg)` }}><PlayingCard faceDown /></div>;
  }
  const source = dealerSourcePoint(geometry, dealerPos);
  const baseTarget = viewportPoint(geometry, geometry.dealTargets[pos]);
  // During the settle phase the local pile continues almost to the bottom hand lane.
  // This keeps the same visible card-back mass on screen while the real hand begins rising.
  const localHandoffDepth = Math.max(72, geometry.trickCardSize.height * 0.9);
  const sideTarget = pos === 0
    ? { x: geometry.localHandCenter.x, y: geometry.localHandCenter.y + localHandoffDepth }
    : pointTowardCenter(geometry.seatOrigins[pos], geometry.dealCenter, 24);
  const target = stackedTarget(settling ? viewportPoint(geometry, sideTarget) : baseTarget, pos, beat.stackIndex);
  const easing = settling ? "cubic-bezier(0.22, 1, 0.36, 1)" : "cubic-bezier(0.2, 0.75, 0.25, 1)";
  return <div data-deal-traveling-card data-deal-visual-seat={pos} data-deal-handoff={settling && pos === 0 ? "local" : undefined} className="absolute [--card-w:clamp(3.4rem,8vw,5.5rem)] transition-[transform,opacity]" style={{ opacity: settling ? 0 : 1, left: source.x, top: source.y, zIndex: 30 + beat.stackIndex, transitionDuration: `${settling ? NORMAL_DEAL_SETTLE_MS : NORMAL_DEAL_TRAVEL_MS}ms`, transitionTimingFunction: easing, transform: `translate(calc(-50% + ${arrived ? target.x - source.x : 0}px), calc(-50% + ${arrived ? target.y - source.y : 0}px)) scale(${arrived ? 1 : 0.58}) rotate(${arrived ? targetRotation : sourceRotation}deg)` }}><PlayingCard faceDown /></div>;
}
export function DealPresentation({ projection, geometry = null, paused = false, onActiveChange, onSettlingChange, onSequenceComplete, onPresentationComplete }: { projection: PlayerGameProjection; geometry?: TableGeometry | null; paused?: boolean; onActiveChange?: (active: boolean) => void; onSettlingChange?: (settling: boolean) => void; onSequenceComplete?: () => void; onPresentationComplete?: (stage: DealPresentationStage) => void }) {
  const artworkSettled = useCriticalCardArtwork([assets.cardBack]);
  const [settling, setSettling] = useState(false);
  const onSettlingChangeRef = useRef(onSettlingChange);
  onSettlingChangeRef.current = onSettlingChange;
  const [interrupted, setInterrupted] = useState(document.visibilityState === "hidden");
  const [resumeGeneration, resume] = useState(0);
  const previousGameId = useRef(projection.gameId); const previousStageKey = useRef<string | null>(null); const acknowledgedStageKey = useRef<string | null>(null);
  const [beats, setBeats] = useState<DealBeat[]>([]); const [visibleIndex, setVisibleIndex] = useState(-1); const [runGeometry, setRunGeometry] = useState<TableGeometry | null>(null); const [runViewerSeat, setRunViewerSeat] = useState<SeatIndex>(projection.viewerSeat); const [runDealerPos, setRunDealerPos] = useState<VisualSeat>(0);
  const timers = useRef<number[]>([]); const onActiveChangeRef = useRef(onActiveChange); const onSequenceCompleteRef = useRef(onSequenceComplete); const onPresentationCompleteRef = useRef(onPresentationComplete);
  onActiveChangeRef.current = onActiveChange; onSequenceCompleteRef.current = onSequenceComplete; onPresentationCompleteRef.current = onPresentationComplete;
  const stage = stageFor(projection);
  const stageKey = stage ? dealPresentationStageKey(projection.gameId, projection.progression.dealNumber, projection.progression.dealerSeat, stage) : null;
  const sequence = useMemo(() => {
    if (!stage || projection.progression.dealerSeat == null) return [];
    const count = stage === "initial" ? 12 : stage === "remaining" ? 24 : projection.progression.cardsPerPlayer * 4; const dealer = projection.progression.dealerSeat as SeatIndex;
    return Array.from({ length: count }, (_, index) => ({ id: `${stageKey}:${index}`, seat: recipientFor(dealer, index), index, stackIndex: Math.floor(index / 4) }));
  }, [projection.progression.cardsPerPlayer, projection.progression.dealerSeat, stage, stageKey]);
  const clearTimers = useCallback(() => { for (const timer of timers.current) window.clearTimeout(timer); timers.current = []; }, []);
  const clearPresentation = useCallback(() => { clearTimers(); setSettling(false); onSettlingChangeRef.current?.(false); setBeats([]); setVisibleIndex(-1); setRunGeometry(null); onActiveChangeRef.current?.(false); }, [clearTimers]);
  const notifyCompletion = useCallback((key: string, presentationStage: DealPresentationStage, startup: boolean) => {
    const completionScope = `${key}:${startup ? "startup" : "gameplay"}`;
    if (acknowledgedStageKey.current === completionScope) return;
    acknowledgedStageKey.current = completionScope;
    onPresentationCompleteRef.current?.(presentationStage);
    if (startup) onSequenceCompleteRef.current?.();
  }, []);
  useLayoutEffect(() => {
    if (previousGameId.current !== projection.gameId) { clearPresentation(); previousGameId.current = projection.gameId; previousStageKey.current = null; acknowledgedStageKey.current = null; }
    if (paused || interrupted) { clearPresentation(); if (stageKey && !dealPresentationWasCompleted(stageKey)) previousStageKey.current = null; return; }
    if (!stage || !stageKey || sequence.length === 0) { clearPresentation(); return; }
    const presentationStage: DealPresentationStage = stage;
    const startup = projection.progression.phase === "DEAL_SETUP";
    if (dealPresentationWasCompleted(stageKey)) {
      previousStageKey.current = stageKey;
      notifyCompletion(stageKey, presentationStage, startup);
      return;
    }
    if (stageKey === previousStageKey.current) return;
    if (!artworkSettled) { onActiveChangeRef.current?.(true); return; }
    startTimingDiagnosticSession(projection.gameId); previousStageKey.current = stageKey; onActiveChangeRef.current?.(true);
    const frozenSequence = sequence.map((beat) => ({ ...beat })); const frozenGeometry = geometry; const frozenViewerSeat = projection.viewerSeat; const frozenDealerPos = visualPosition(frozenViewerSeat, projection.progression.dealerSeat as SeatIndex);
    setRunGeometry(frozenGeometry); setRunViewerSeat(frozenViewerSeat); setRunDealerPos(frozenDealerPos); setBeats(frozenSequence); setVisibleIndex(-1);
    if (presentationStage !== "remaining") playGameSound("shuffle", `${projection.gameId}:${projection.progression.dealNumber}`);
    const { staggerMs, settleMs, tailMs } = dealPresentationTiming(false);
    const leadInMs = presentationStage === "remaining" ? NINE_CARD_TRUMP_ANNOUNCEMENT_LEAD_IN_MS : 0;
    recordTimingDiagnostic("deal_sequence_start", { browserReducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, gameplayReducedMotionOverride: false, stage: presentationStage, dealNumber: projection.progression.dealNumber, dealerSeat: projection.progression.dealerSeat ?? -1, cardCount: frozenSequence.length, staggerMs, travelMs: NORMAL_DEAL_TRAVEL_MS, settleMs, tailMs, leadInMs, frozenGeometryEpoch: frozenGeometry?.epoch ?? 0, dealCenterX: frozenGeometry?.dealCenter.x ?? null, dealCenterY: frozenGeometry?.dealCenter.y ?? null });
    frozenSequence.forEach((beat, index) => {
      const scheduledOffsetMs = leadInMs + index * staggerMs;
      timers.current.push(window.setTimeout(() => { setVisibleIndex(index); recordTimingDiagnostic("deal_card_visible", { index, seat: beat.seat, stage: presentationStage, scheduledOffsetMs }); playGameSound("deal", beat.id); }, scheduledOffsetMs));
    });
    const settleAt = leadInMs + (frozenSequence.length - 1) * staggerMs + NORMAL_DEAL_TRAVEL_MS;
    timers.current.push(window.setTimeout(() => {
      setSettling(true); onSettlingChangeRef.current?.(true);
      recordTimingDiagnostic("deal_sequence_settling", { stage: presentationStage, scheduledOffsetMs: settleAt, settleMs });
    }, settleAt));
    const completeAt = settleAt + settleMs + tailMs;
    timers.current.push(window.setTimeout(() => { recordTimingDiagnostic("deal_sequence_complete", { stage: presentationStage, scheduledOffsetMs: completeAt }); markPresented(stageKey); notifyCompletion(stageKey, presentationStage, startup); clearPresentation(); }, completeAt));
  }, [clearPresentation, geometry, notifyCompletion, paused, projection.gameId, projection.progression.dealNumber, projection.progression.dealerSeat, projection.progression.phase, projection.viewerSeat, sequence, stage, stageKey, interrupted, resumeGeneration, artworkSettled]);
  useLayoutEffect(() => {
    const interrupt = () => { setInterrupted(true); clearPresentation(); if (stageKey && !dealPresentationWasCompleted(stageKey)) previousStageKey.current = null; };
    const restore = () => { if (document.visibilityState !== "hidden") { setInterrupted(false); resume(n => n + 1); } };
    const orientation = () => { interrupt(); restore(); };
    const visibility = () => document.visibilityState === "hidden" ? interrupt() : restore();
    window.addEventListener("orientationchange", orientation); window.addEventListener("focus", restore); window.addEventListener("blur", interrupt); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("orientationchange", orientation); window.removeEventListener("focus", restore); window.removeEventListener("blur", interrupt); document.removeEventListener("visibilitychange", visibility); clearTimers(); };
  }, [clearPresentation, clearTimers, stageKey]);
  if (beats.length === 0) return null;
  const visibleBeats = visibleIndex < 0 ? [] : beats.slice(0, visibleIndex + 1);
  return <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden="true" data-deal-settling={settling} data-deal-geometry-epoch={runGeometry?.epoch ?? 0} data-dealer-visual-pos={runDealerPos}>
    <DealerDeckStack geometry={runGeometry} dealerPos={runDealerPos} settling={settling} />
    {visibleBeats.map((beat) => { const pos = visualPosition(runViewerSeat, beat.seat); return <TravelingBack key={beat.id} settling={settling} beat={beat} pos={pos} geometry={runGeometry} dealerPos={runDealerPos} />; })}
  </div>;
}

