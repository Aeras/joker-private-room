import { useReducedMotion } from "./useReducedMotion";
import { REDUCED_MOTION_DISTANCE_PX } from "./presentationTiming";
import { PresentationRun } from "./presentationRun";
import { assets } from "@/assets/registry";
import { useCriticalCardArtwork } from "./useCriticalCardArtwork";
import { markPresentationCompleted } from "./presentationCompletion";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { nextSeat, type SeatIndex } from "@/domain/dealing";
import type { PlayerGameProjection } from "@/domain/projection";
import { playGameSound } from "@/lib/gameAudio";
import { recordTimingDiagnostic, startTimingDiagnosticSession } from "@/lib/timingDiagnostics";
import { TrumpDeckMotion } from "./TrumpDeckMotion";
import { PlayingCard } from "../joker/PlayingCard";
import {
  NORMAL_DEAL_TRAVEL_MS,
  NORMAL_DEAL_HANDOFF_TRAVEL_MS,
  NORMAL_DEAL_HANDOFF_FADE_DELAY_MS,
  NORMAL_DEAL_HANDOFF_FADE_MS,
  dealPresentationStageKey,
  dealPresentationStorageKey,
  dealPresentationTiming,
  dealPresentationWasCompleted,
} from "./dealPresentationModel";
import type { Point, TableGeometry, VisualSeat } from "./useTableGeometry";

type DealBeat = { id: string; seat: SeatIndex; index: number; stackIndex: number };
export type DealPresentationStage = "initial" | "remaining" | "full";
import { NINE_CARD_TRUMP_ANNOUNCEMENT_LEAD_IN_MS } from "./presentationTiming";
export { NINE_CARD_TRUMP_ANNOUNCEMENT_LEAD_IN_MS } from "./presentationTiming";
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
// Exit anchors are screen edges. Move the whole rotated card and stack beyond
// them before revealing the hand; the margin also covers the final paint frame.
function pileExitOffset(pos: VisualSeat, stackIndex: number, fallback?: { left: string; top: string }): string {
  // Without measurements the fallback origin is a percentage of the full-screen overlay.
  const remaining = !fallback ? "0px" : pos === 0 ? `${100 - Number.parseFloat(fallback.top) - 22}vh` : pos === 2 ? `${Number.parseFloat(fallback.top) - 22}vh` : pos === 1 ? `${Number.parseFloat(fallback.left) - 26}vw` : `${100 - Number.parseFloat(fallback.left) - 26}vw`;
  const distance = `calc(${remaining} + var(--card-w) * 0.7 + ${stackIndex * 6 + 24}px)`;
  return pos === 0 ? `translateY(${distance})` : pos === 2 ? `translateY(calc(-1 * ${distance}))` : pos === 1 ? `translateX(calc(-1 * ${distance}))` : `translateX(${distance})`;
}
function DealerDeckStack({ geometry, dealerPos, settling }: { geometry: TableGeometry | null; dealerPos: VisualSeat; settling: boolean }) {
  const rotation = SEAT_ROTATION[dealerPos];
  if (!geometry) {
    const fallback = FALLBACK_DEALER_SOURCE[dealerPos];
    return <div data-dealer-deck-stack data-dealer-pos={dealerPos} className="absolute [--card-w:var(--desktop-deal-card-w,clamp(3.4rem,8vw,5.5rem))]" style={{ opacity: settling ? 0 : 1, transition: `opacity ${NORMAL_DEAL_HANDOFF_FADE_MS}ms ease-out ${settling ? NORMAL_DEAL_HANDOFF_FADE_DELAY_MS : 0}ms`, left: fallback.left, top: fallback.top, transform: `translate(-50%, -50%) rotate(${rotation}deg)`, zIndex: 28 }}>
      {[2, 1, 0].map((layer) => <div key={layer} className="absolute left-0 top-0" style={{ transform: `translate(${layer * 3}px, ${layer * -2}px)` }}><PlayingCard faceDown /></div>)}
    </div>;
  }
  const source = dealerSourcePoint(geometry, dealerPos);
  return <div data-dealer-deck-stack data-dealer-pos={dealerPos} className="absolute [--card-w:var(--desktop-deal-card-w,clamp(3.4rem,8vw,5.5rem))]" style={{ opacity: settling ? 0 : 1, transition: `opacity ${NORMAL_DEAL_HANDOFF_FADE_MS}ms ease-out ${settling ? NORMAL_DEAL_HANDOFF_FADE_DELAY_MS : 0}ms`, left: source.x, top: source.y, transform: `translate(-50%, -50%) rotate(${rotation}deg)`, zIndex: 28 }}>
    {[2, 1, 0].map((layer) => <div key={layer} className="absolute left-0 top-0" style={{ transform: `translate(${layer * 3}px, ${layer * -2}px)` }}><PlayingCard faceDown /></div>)}
  </div>;
}
function TravelingBack({ beat, pos, geometry, dealerPos, settling, landed = false }: { beat: DealBeat; pos: VisualSeat; geometry: TableGeometry | null; dealerPos: VisualSeat; settling: boolean; landed?: boolean }) {
  const preference = useReducedMotion();
  const reduced = useRef(preference).current;
  const [arrived, setArrived] = useState(landed);
  useLayoutEffect(() => { if (landed) { setArrived(true); return; } setArrived(false); const frame = window.requestAnimationFrame(() => setArrived(true)); return () => window.cancelAnimationFrame(frame); }, [beat.id, landed]);
  const sourceRotation = SEAT_ROTATION[dealerPos];
  const targetRotation = SEAT_ROTATION[pos];
  if (!geometry) {
    const fallback = FALLBACK_DEALER_SOURCE[dealerPos];
    return <div data-deal-traveling-card data-deal-visual-seat={pos} className="absolute [--card-w:var(--desktop-deal-card-w,clamp(3.4rem,8vw,5.5rem))] transition-[transform,opacity] ease-out" style={{ opacity: settling || (reduced && !arrived) ? 0 : 1, left: fallback.left, top: fallback.top, zIndex: 30 + beat.stackIndex, transitionDuration: settling ? `${NORMAL_DEAL_HANDOFF_TRAVEL_MS}ms, ${NORMAL_DEAL_HANDOFF_FADE_MS}ms` : `${NORMAL_DEAL_TRAVEL_MS}ms`, transitionDelay: settling ? `0ms, ${NORMAL_DEAL_HANDOFF_FADE_DELAY_MS}ms` : "0ms", transform: reduced ? `${FALLBACK_TARGET[pos]} translateY(${arrived ? 0 : REDUCED_MOTION_DISTANCE_PX}px) rotate(${targetRotation}deg)` : arrived ? `${FALLBACK_TARGET[pos]} ${settling && !reduced ? pileExitOffset(pos, beat.stackIndex, fallback) : ""} rotate(${targetRotation}deg)` : `translate(-50%, -50%) scale(.58) rotate(${sourceRotation}deg)` }}><PlayingCard faceDown /></div>;
  }
  const source = dealerSourcePoint(geometry, dealerPos);
  const baseTarget = viewportPoint(geometry, geometry.dealTargets[pos]);
  // Each pile exits along its own axis; the hand lane must not pull it sideways.
  const sideTarget = geometry.dealExitTargets?.[pos] ?? {
    x: pos === 1 ? -geometry.feltRect.left : pos === 3 ? geometry.feltRect.left + 2 * geometry.dealCenter.x : geometry.dealTargets[pos].x,
    y: pos === 0 ? geometry.feltRect.top + 2 * geometry.dealCenter.y : pos === 2 ? -geometry.feltRect.top : geometry.dealTargets[pos].y,
  };
  const target = stackedTarget(settling && !reduced ? viewportPoint(geometry, sideTarget) : baseTarget, pos, beat.stackIndex);
  const easing = settling ? "linear" : "cubic-bezier(0.2, 0.75, 0.25, 1)";
  return <div data-deal-traveling-card data-deal-visual-seat={pos} data-deal-handoff={settling && pos === 0 ? "local" : undefined} className="absolute [--card-w:var(--desktop-deal-card-w,clamp(3.4rem,8vw,5.5rem))] transition-[transform,opacity]" style={{ opacity: settling || (reduced && !arrived) ? 0 : 1, left: source.x, top: source.y, zIndex: 30 + beat.stackIndex, transitionDuration: settling ? `${NORMAL_DEAL_HANDOFF_TRAVEL_MS}ms, ${NORMAL_DEAL_HANDOFF_FADE_MS}ms` : `${NORMAL_DEAL_TRAVEL_MS}ms`, transitionDelay: settling ? `0ms, ${NORMAL_DEAL_HANDOFF_FADE_DELAY_MS}ms` : "0ms", transitionTimingFunction: easing, transform: `translate(calc(-50% + ${arrived || reduced ? target.x - source.x : 0}px), calc(-50% + ${reduced ? target.y - source.y + (arrived ? 0 : REDUCED_MOTION_DISTANCE_PX) : arrived ? target.y - source.y : 0}px)) ${settling && !reduced ? pileExitOffset(pos, beat.stackIndex) : ""} scale(${reduced || arrived ? 1 : 0.58}) rotate(${reduced || arrived ? targetRotation : sourceRotation}deg)` }}><PlayingCard faceDown /></div>;
}
export function DealPresentation({ projection, geometry = null, paused = false, onActiveChange, onSettlingChange, onSequenceComplete, onPresentationComplete, trumpTargetRef, onTrumpPlaced }: { projection: PlayerGameProjection; geometry?: TableGeometry | null; paused?: boolean; onActiveChange?: (active: boolean) => void; onSettlingChange?: (settling: boolean) => void; onSequenceComplete?: () => void; onPresentationComplete?: (stage: DealPresentationStage) => void; trumpTargetRef?: RefObject<HTMLDivElement | null>; onTrumpPlaced?: (key: string | null) => void }) {
  const exposedCard = projection.cards.exposedTrumpCard;
  const artworkSettled = useCriticalCardArtwork([assets.cardBack, ...(exposedCard ? [assets.cardFace(exposedCard)] : [])]);
  const latestProjection = useRef(projection); latestProjection.current = projection;
  const [trumpMotionActive, setTrumpMotionActive] = useState(false);
  const [trumpPlaced, setTrumpPlaced] = useState(false);
  const afterTrump = useRef<(() => void) | null>(null);
  const presentedTrumpKey = useRef<string | null>(null);
  const onTrumpPlacedRef = useRef(onTrumpPlaced); onTrumpPlacedRef.current = onTrumpPlaced;
  const handArtworkSettled = useCriticalCardArtwork(projection.cards.ownHandVisible ? projection.cards.ownHand.map(card => assets.cardFace(card)) : []);
  const waitingForFirstHand = useRef<string | null>(null);
  const running = useRef(false);
  const [settling, setSettling] = useState(false);
  const onSettlingChangeRef = useRef(onSettlingChange);
  onSettlingChangeRef.current = onSettlingChange;
  const [interrupted, setInterrupted] = useState(document.visibilityState === "hidden");
  const [resumeGeneration, resume] = useState(0);
  const previousGameId = useRef(projection.gameId); const previousStageKey = useRef<string | null>(null); const acknowledgedStageKey = useRef<string | null>(null);
  const [beats, setBeats] = useState<DealBeat[]>([]); const [visibleIndex, setVisibleIndex] = useState(-1); const [runGeometry, setRunGeometry] = useState<TableGeometry | null>(null); const [runViewerSeat, setRunViewerSeat] = useState<SeatIndex>(projection.viewerSeat); const [runDealerPos, setRunDealerPos] = useState<VisualSeat>(0);
  const runs = useRef(new PresentationRun());
  const timers = useRef<number[]>([]); const onActiveChangeRef = useRef(onActiveChange); const onSequenceCompleteRef = useRef(onSequenceComplete); const onPresentationCompleteRef = useRef(onPresentationComplete);
  onActiveChangeRef.current = onActiveChange; onSequenceCompleteRef.current = onSequenceComplete; onPresentationCompleteRef.current = onPresentationComplete;
  const stage = stageFor(projection);
  const stageKey = stage ? dealPresentationStageKey(projection.gameId, projection.progression.dealNumber, projection.progression.dealerSeat, stage) : null;
  const sequence = useMemo(() => {
    if (!stage || projection.progression.dealerSeat == null) return [];
    const count = stage === "initial" ? 12 : stage === "remaining" ? 24 : projection.progression.cardsPerPlayer * 4; const dealer = projection.progression.dealerSeat as SeatIndex;
    return Array.from({ length: count }, (_, index) => ({ id: `${stageKey}:${index}`, seat: recipientFor(dealer, index), index, stackIndex: Math.floor(index / 4) + (stage === "remaining" ? 3 : 0) }));
  }, [projection.progression.cardsPerPlayer, projection.progression.dealerSeat, stage, stageKey]);
  const clearTimers = useCallback(() => { runs.current.invalidate(); for (const timer of timers.current) window.clearTimeout(timer); timers.current = []; }, []);
  const clearPresentation = useCallback(() => { clearTimers(); running.current = false; waitingForFirstHand.current = null; afterTrump.current = null; setTrumpMotionActive(false); setTrumpPlaced(false); setSettling(false); onSettlingChangeRef.current?.(false); setBeats([]); setVisibleIndex(-1); setRunGeometry(null); onActiveChangeRef.current?.(false); }, [clearTimers]);
  const notifyCompletion = useCallback((key: string, presentationStage: DealPresentationStage, startup: boolean) => {
    const completionScope = `${key}:${startup ? "startup" : "gameplay"}`;
    if (acknowledgedStageKey.current === completionScope) return;
    acknowledgedStageKey.current = completionScope;
    onPresentationCompleteRef.current?.(presentationStage);
    if (startup) onSequenceCompleteRef.current?.();
  }, []);
  const beginHandoff = useCallback((key: string, presentationStage: DealPresentationStage, startup: boolean) => {
    const current = latestProjection.current;
    if (startup && current.lifecycle === "starting" && current.cards.ownHandVisible === false) {
      // Startup releases the canonical hand only after the trump deck is placed.
      waitingForFirstHand.current = key;
      markPresented(key); notifyCompletion(key, presentationStage, true);
      recordTimingDiagnostic("deal_waiting_for_first_hand", { stage: presentationStage });
      return;
    }
    const { settleMs, tailMs } = dealPresentationTiming(false);
    setSettling(true);
    timers.current.push(window.setTimeout(runs.current.guard(() => onSettlingChangeRef.current?.(true)), NORMAL_DEAL_HANDOFF_FADE_DELAY_MS));
    recordTimingDiagnostic("deal_sequence_settling", { stage: presentationStage, settleMs });
    timers.current.push(window.setTimeout(runs.current.guard(() => {
      recordTimingDiagnostic("deal_sequence_complete", { stage: presentationStage });
      markPresented(key); notifyCompletion(key, presentationStage, startup); clearPresentation();
    }), settleMs + tailMs));
  }, [clearPresentation, notifyCompletion]);
  const completeTrumpMotion = useCallback(() => {
    setTrumpMotionActive(false); setTrumpPlaced(true);
    const current = latestProjection.current;
    const key = `${current.gameId}:${current.progression.dealNumber}`;
    presentedTrumpKey.current = key; onTrumpPlacedRef.current?.(key);
    const next = afterTrump.current; afterTrump.current = null; next?.();
  }, []);
  useLayoutEffect(() => {
    if (previousGameId.current !== projection.gameId) { clearPresentation(); previousGameId.current = projection.gameId; previousStageKey.current = null; acknowledgedStageKey.current = null; }
    if (paused || interrupted) { clearPresentation(); if (stageKey) previousStageKey.current = null; return; }
    if (!stage || !stageKey || sequence.length === 0) { clearPresentation(); return; }
    const presentationStage: DealPresentationStage = stage;
    const startup = projection.progression.phase === "DEAL_SETUP";
    if (running.current && stageKey === previousStageKey.current) {
      if (waitingForFirstHand.current === stageKey && projection.cards.ownHandVisible && handArtworkSettled) {
        waitingForFirstHand.current = null;
        beginHandoff(stageKey, presentationStage, startup);
      }
      return;
    }
    if (dealPresentationWasCompleted(stageKey)) {
      previousStageKey.current = stageKey;
      notifyCompletion(stageKey, presentationStage, startup);
      return;
    }
    if (stageKey === previousStageKey.current) return;
    if (!artworkSettled) { onActiveChangeRef.current?.(true); return; }
    // A cancelled handoff can replay this run; hide its old placed deck first.
    if (presentedTrumpKey.current != null) { presentedTrumpKey.current = null; onTrumpPlacedRef.current?.(null); }
    clearTimers(); startTimingDiagnosticSession(projection.gameId); running.current = true; previousStageKey.current = stageKey; onActiveChangeRef.current?.(true);
    const frozenSequence = sequence.map((beat) => ({ ...beat })); const frozenGeometry = geometry; const frozenViewerSeat = projection.viewerSeat; const frozenDealerPos = visualPosition(frozenViewerSeat, projection.progression.dealerSeat as SeatIndex);
    setRunGeometry(frozenGeometry); setRunViewerSeat(frozenViewerSeat); setRunDealerPos(frozenDealerPos); setBeats(frozenSequence); setVisibleIndex(-1);
    if (presentationStage !== "remaining") playGameSound("shuffle", `${projection.gameId}:${projection.progression.dealNumber}`);
    const { staggerMs, settleMs, tailMs } = dealPresentationTiming(false);
    const leadInMs = presentationStage === "remaining" ? NINE_CARD_TRUMP_ANNOUNCEMENT_LEAD_IN_MS : 0;
    recordTimingDiagnostic("deal_sequence_start", { browserReducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, gameplayReducedMotionOverride: false, stage: presentationStage, dealNumber: projection.progression.dealNumber, dealerSeat: projection.progression.dealerSeat ?? -1, cardCount: frozenSequence.length, staggerMs, travelMs: NORMAL_DEAL_TRAVEL_MS, settleMs, tailMs, leadInMs, frozenGeometryEpoch: frozenGeometry?.epoch ?? 0, dealCenterX: frozenGeometry?.dealCenter.x ?? null, dealCenterY: frozenGeometry?.dealCenter.y ?? null });
    frozenSequence.forEach((beat, index) => {
      const scheduledOffsetMs = leadInMs + index * staggerMs;
      timers.current.push(window.setTimeout(runs.current.guard(() => { setVisibleIndex(index); recordTimingDiagnostic("deal_card_visible", { index, seat: beat.seat, stage: presentationStage, scheduledOffsetMs }); playGameSound("deal", beat.id); }), scheduledOffsetMs));
    });
    const settleAt = leadInMs + (frozenSequence.length - 1) * staggerMs + NORMAL_DEAL_TRAVEL_MS;
    timers.current.push(window.setTimeout(runs.current.guard(() => {
      if (presentationStage === "full" && exposedCard) {
        afterTrump.current = runs.current.guard(() => beginHandoff(stageKey, presentationStage, startup));
        setTrumpMotionActive(true);
      } else beginHandoff(stageKey, presentationStage, startup);
    }), settleAt));
  }, [clearTimers, clearPresentation, geometry, notifyCompletion, paused, projection.gameId, projection.progression.dealNumber, projection.progression.dealerSeat, projection.progression.phase, projection.viewerSeat, sequence, stage, stageKey, interrupted, resumeGeneration, artworkSettled, handArtworkSettled, projection.cards.ownHandVisible, projection.lifecycle, exposedCard, beginHandoff]);
  useLayoutEffect(() => {
    const interrupt = () => { setInterrupted(true); clearPresentation(); if (stageKey && !dealPresentationWasCompleted(stageKey)) previousStageKey.current = null; };
    const restore = () => { if (document.visibilityState !== "hidden") { setInterrupted(false); resume(n => n + 1); } };
    const orientation = () => { interrupt(); restore(); };
    const visibility = () => document.visibilityState === "hidden" ? interrupt() : restore();
    window.addEventListener("orientationchange", orientation); window.addEventListener("focus", restore); window.addEventListener("blur", interrupt); document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("orientationchange", orientation); window.removeEventListener("focus", restore); window.removeEventListener("blur", interrupt); document.removeEventListener("visibilitychange", visibility);
      clearTimers(); running.current = false; waitingForFirstHand.current = null; afterTrump.current = null;
      if (stageKey && !dealPresentationWasCompleted(stageKey)) previousStageKey.current = null;
    };
  }, [clearPresentation, clearTimers, stageKey]);
  // Public face-down counts survive the choice boundary and reconnect; no
  // hidden hand is needed. Resolved trump no longer contains chooserSeat.
  const chooserSeat = projection.trump?.status === "chooser_pending" ? projection.trump.chooserSeat : projection.progression.firstDeclarerSeat;
  const initialKey = dealPresentationStageKey(projection.gameId, projection.progression.dealNumber, projection.progression.dealerSeat, "initial");
  const remainingKey = dealPresentationStageKey(projection.gameId, projection.progression.dealNumber, projection.progression.dealerSeat, "remaining");
  const retainInitial = chooserSeat != null && projection.rulesetId !== "classic" && projection.progression.cardsPerPlayer === 9 && (
    projection.progression.phase === "NINE_CARD_TRUMP_CHOICE" ||
    (stage === "initial" && dealPresentationWasCompleted(initialKey)) ||
    (stage === "remaining" && !dealPresentationWasCompleted(remainingKey))
  );
  const retainedBeats: DealBeat[] = retainInitial && projection.progression.dealerSeat != null
    ? Array.from({ length: 12 }, (_, index) => ({ id: `${initialKey}:${index}`, seat: recipientFor(projection.progression.dealerSeat as SeatIndex, index), index, stackIndex: Math.floor(index / 4) })).filter(beat => beat.seat !== chooserSeat)
    : [];
  if (beats.length === 0 && retainedBeats.length === 0) return null;
  const visibleBeats = visibleIndex < 0 ? [] : beats.slice(0, visibleIndex + 1);
  const visibleIds = new Set(visibleBeats.map(beat => beat.id));
  const cards = [...retainedBeats.filter(beat => !visibleIds.has(beat.id)), ...visibleBeats];
  const displayGeometry = runGeometry ?? geometry;
  const displayViewerSeat = beats.length ? runViewerSeat : projection.viewerSeat;
  const displayDealerPos = beats.length ? runDealerPos : visualPosition(projection.viewerSeat, projection.progression.dealerSeat as SeatIndex);
  return <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden="true" data-deal-settling={settling} data-deal-geometry-epoch={runGeometry?.epoch ?? 0} data-dealer-visual-pos={runDealerPos}>
    {beats.length > 0 && !trumpMotionActive && !trumpPlaced && <DealerDeckStack geometry={displayGeometry} dealerPos={displayDealerPos} settling={settling} />}
    {trumpMotionActive && exposedCard && <TrumpDeckMotion key={stageKey ?? "trump"} card={exposedCard}
      source={displayGeometry ? dealerSourcePoint(displayGeometry, displayDealerPos) : { x: window.innerWidth * Number.parseFloat(FALLBACK_DEALER_SOURCE[displayDealerPos].left) / 100, y: window.innerHeight * Number.parseFloat(FALLBACK_DEALER_SOURCE[displayDealerPos].top) / 100 }}
      rotation={SEAT_ROTATION[displayDealerPos]} targetRef={trumpTargetRef} onPlaced={runs.current.guard(completeTrumpMotion)} />}
    {cards.map((beat) => { const pos = visualPosition(displayViewerSeat, beat.seat); const retained = !visibleIds.has(beat.id); const exits = settling && (stage !== "initial" || beat.seat === chooserSeat); return <TravelingBack key={beat.id} settling={exits} landed={retained} beat={beat} pos={pos} geometry={displayGeometry} dealerPos={displayDealerPos} />; })}
  </div>;
}
