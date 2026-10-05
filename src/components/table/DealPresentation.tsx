import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { nextSeat, type SeatIndex } from "@/domain/dealing";
import type { PlayerGameProjection } from "@/domain/projection";
import { playGameSound } from "@/lib/gameAudio";
import { recordTimingDiagnostic, startTimingDiagnosticSession } from "@/lib/timingDiagnostics";
import { PlayingCard } from "../joker/PlayingCard";
import {
  NORMAL_DEAL_TRAVEL_MS,
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
function stageFor(projection: PlayerGameProjection): DealPresentationStage | null {
  if (projection.progression.phase === "DEAL_SETUP") return "full";
  if (projection.progression.cardsPerPlayer === 9 && projection.rulesetId !== "classic") {
    if (projection.progression.phase === "NINE_CARD_INITIAL_DEAL_ALL_SEATS") return "initial";
    if (projection.progression.phase === "NINE_CARD_REMAINING_DEAL") return "remaining";
    return null;
  }
  if (projection.progression.phase === "DECLARATION") return "full";
  return null;
}
function beatCount(projection: PlayerGameProjection, stage: DealPresentationStage): number { if (stage === "initial") return 12; if (stage === "remaining") return 24; return projection.progression.cardsPerPlayer * 4; }
function recipientFor(dealerSeat: SeatIndex, beatIndex: number): SeatIndex { return nextSeat(nextSeat(dealerSeat), beatIndex % 4); }
function visualPosition(viewerSeat: SeatIndex, seat: SeatIndex): VisualSeat { return ((seat - viewerSeat + 4) % 4) as VisualSeat; }
function viewportPoint(geometry: TableGeometry, local: Point): Point { return { x: geometry.feltRect.left + local.x, y: geometry.feltRect.top + local.y }; }
function stackedTarget(base: Point, pos: VisualSeat, stackIndex: number): Point { const offset = stackIndex * 6; if (pos === 3) return { x: base.x - offset, y: base.y + stackIndex * 2 }; if (pos === 1) return { x: base.x + offset, y: base.y + stackIndex * 2 }; return { x: base.x + offset, y: base.y + stackIndex * 2 }; }
function markPresented(stageKey: string): void { if (typeof window === "undefined") return; try { window.sessionStorage.setItem(dealPresentationStorageKey(stageKey), "1"); } catch { /* optional presentation storage */ } }
function TravelingBack({ beat, pos, geometry }: { beat: DealBeat; pos: VisualSeat; geometry: TableGeometry | null }) {
  const [arrived, setArrived] = useState(false);
  useLayoutEffect(() => { setArrived(false); const frame = window.requestAnimationFrame(() => setArrived(true)); return () => window.cancelAnimationFrame(frame); }, [beat.id]);
  if (!geometry) return <div className="absolute left-1/2 top-1/2 [--card-w:clamp(2.3rem,4.8vw,3.65rem)] transition-transform ease-out" style={{ zIndex: 30 + beat.stackIndex, transitionDuration: `${NORMAL_DEAL_TRAVEL_MS}ms`, transform: arrived ? FALLBACK_TARGET[pos] : "translate(-50%, -50%) scale(.58)" }}><PlayingCard faceDown /></div>;
  const source = viewportPoint(geometry, geometry.dealCenter); const baseTarget = viewportPoint(geometry, geometry.dealTargets[pos]); const target = stackedTarget(baseTarget, pos, beat.stackIndex);
  return <div className="absolute [--card-w:clamp(2.3rem,4.8vw,3.65rem)] transition-[left,top,transform] ease-out" style={{ left: arrived ? target.x : source.x, top: arrived ? target.y : source.y, zIndex: 30 + beat.stackIndex, transitionDuration: `${NORMAL_DEAL_TRAVEL_MS}ms`, transform: `translate(-50%, -50%) scale(${arrived ? 1 : 0.58})` }}><PlayingCard faceDown /></div>;
}
export function DealPresentation({ projection, geometry = null, paused = false, onActiveChange, onSequenceComplete, onPresentationComplete }: { projection: PlayerGameProjection; geometry?: TableGeometry | null; paused?: boolean; onActiveChange?: (active: boolean) => void; onSequenceComplete?: () => void; onPresentationComplete?: (stage: DealPresentationStage) => void }) {
  const previousGameId = useRef(projection.gameId); const previousStageKey = useRef<string | null>(null); const acknowledgedStageKey = useRef<string | null>(null);
  const [beats, setBeats] = useState<DealBeat[]>([]); const [visibleIndex, setVisibleIndex] = useState(-1); const [runGeometry, setRunGeometry] = useState<TableGeometry | null>(null); const [runViewerSeat, setRunViewerSeat] = useState<SeatIndex>(projection.viewerSeat);
  const timers = useRef<number[]>([]); const onActiveChangeRef = useRef(onActiveChange); const onSequenceCompleteRef = useRef(onSequenceComplete); const onPresentationCompleteRef = useRef(onPresentationComplete);
  onActiveChangeRef.current = onActiveChange; onSequenceCompleteRef.current = onSequenceComplete; onPresentationCompleteRef.current = onPresentationComplete;
  const stage = stageFor(projection);
  const stageKey = stage ? dealPresentationStageKey(projection.gameId, projection.progression.dealNumber, projection.progression.dealerSeat, stage) : null;
  const sequence = useMemo(() => {
    if (!stage || projection.progression.dealerSeat == null) return [];
    const count = beatCount(projection, stage); const dealer = projection.progression.dealerSeat as SeatIndex;
    return Array.from({ length: count }, (_, index) => ({ id: `${stageKey}:${index}`, seat: recipientFor(dealer, index), index, stackIndex: Math.floor(index / 4) }));
  }, [projection.progression.cardsPerPlayer, projection.progression.dealerSeat, stage, stageKey]);
  const clearTimers = useCallback(() => { for (const timer of timers.current) window.clearTimeout(timer); timers.current = []; }, []);
  const clearPresentation = useCallback(() => { clearTimers(); setBeats([]); setVisibleIndex(-1); setRunGeometry(null); onActiveChangeRef.current?.(false); }, [clearTimers]);
  const notifyCompletion = useCallback((key: string, completedStage: DealPresentationStage, startup: boolean) => {
    if (acknowledgedStageKey.current === key) return;
    acknowledgedStageKey.current = key;
    onPresentationCompleteRef.current?.(completedStage);
    if (startup) onSequenceCompleteRef.current?.();
  }, []);
  useLayoutEffect(() => {
    if (previousGameId.current !== projection.gameId) { clearPresentation(); previousGameId.current = projection.gameId; previousStageKey.current = null; acknowledgedStageKey.current = null; }
    if (paused) { clearPresentation(); if (stageKey && !dealPresentationWasCompleted(stageKey)) previousStageKey.current = null; return; }
    if (!stage || !stageKey || sequence.length === 0) return;
    const presentationStage: DealPresentationStage = stage;
    const startup = projection.progression.phase === "DEAL_SETUP";
    if (dealPresentationWasCompleted(stageKey)) {
      previousStageKey.current = stageKey;
      notifyCompletion(stageKey, presentationStage, startup);
      return;
    }
    if (stageKey === previousStageKey.current) return;
    startTimingDiagnosticSession(projection.gameId); previousStageKey.current = stageKey; onActiveChangeRef.current?.(true);
    const frozenSequence = sequence.map((beat) => ({ ...beat })); const frozenGeometry = geometry; const frozenViewerSeat = projection.viewerSeat;
    setRunGeometry(frozenGeometry); setRunViewerSeat(frozenViewerSeat); setBeats(frozenSequence); setVisibleIndex(-1);
    if (presentationStage !== "remaining") playGameSound("shuffle", `${projection.gameId}:${projection.progression.dealNumber}`);
    const { staggerMs, tailMs } = dealPresentationTiming(false);
    const leadInMs = presentationStage === "remaining" ? NINE_CARD_TRUMP_ANNOUNCEMENT_LEAD_IN_MS : 0;
    recordTimingDiagnostic("deal_sequence_start", { browserReducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, gameplayReducedMotionOverride: false, stage: presentationStage, dealNumber: projection.progression.dealNumber, dealerSeat: projection.progression.dealerSeat ?? -1, cardCount: frozenSequence.length, staggerMs, travelMs: NORMAL_DEAL_TRAVEL_MS, tailMs, leadInMs, frozenGeometryEpoch: frozenGeometry?.epoch ?? 0, dealCenterX: frozenGeometry?.dealCenter.x ?? null, dealCenterY: frozenGeometry?.dealCenter.y ?? null });
    frozenSequence.forEach((beat, index) => {
      const scheduledOffsetMs = leadInMs + index * staggerMs;
      timers.current.push(window.setTimeout(() => { setVisibleIndex(index); recordTimingDiagnostic("deal_card_visible", { index, seat: beat.seat, stage: presentationStage, scheduledOffsetMs }); playGameSound("deal", beat.id); }, scheduledOffsetMs));
    });
    const completeAt = leadInMs + frozenSequence.length * staggerMs + tailMs;
    timers.current.push(window.setTimeout(() => { recordTimingDiagnostic("deal_sequence_complete", { stage: presentationStage, scheduledOffsetMs: completeAt }); markPresented(stageKey); notifyCompletion(stageKey, presentationStage, startup); clearPresentation(); }, completeAt));
  }, [clearPresentation, geometry, notifyCompletion, paused, projection.gameId, projection.progression.dealNumber, projection.progression.phase, projection.viewerSeat, sequence, stage, stageKey]);
  useLayoutEffect(() => {
    const visibility = () => { if (document.visibilityState !== "visible") { recordTimingDiagnostic("deal_sequence_interrupted", { visibilityState: document.visibilityState }); clearPresentation(); if (stageKey && !dealPresentationWasCompleted(stageKey)) previousStageKey.current = null; } };
    const interrupt = () => { clearPresentation(); if (stageKey && !dealPresentationWasCompleted(stageKey)) previousStageKey.current = null; };
    window.addEventListener("orientationchange", interrupt); window.addEventListener("blur", interrupt); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("orientationchange", interrupt); window.removeEventListener("blur", interrupt); document.removeEventListener("visibilitychange", visibility); clearTimers(); };
  }, [clearPresentation, clearTimers, stageKey]);
  if (beats.length === 0 || visibleIndex < 0) return null;
  const visibleBeats = beats.slice(0, visibleIndex + 1);
  return <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden="true" data-deal-geometry-epoch={runGeometry?.epoch ?? 0}>{visibleBeats.map((beat) => { const pos = visualPosition(runViewerSeat, beat.seat); return <TravelingBack key={beat.id} beat={beat} pos={pos} geometry={runGeometry} />; })}</div>;
}
