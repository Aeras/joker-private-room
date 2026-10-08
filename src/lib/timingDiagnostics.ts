import {
  DEALER_SELECTION_CARD_TRAVEL_MS,
  DEALER_SELECTION_STAGGER_MS,
  DEALER_SELECTION_WINNER_HOLD_MS,
  DEALER_START_CUE_MS,
} from "@/components/table/dealerSelectionPresentationModel";
import {
  NORMAL_DEAL_STAGGER_MS,
  NORMAL_DEAL_TAIL_MS,
  NORMAL_DEAL_TRAVEL_MS,
} from "@/components/table/dealPresentationModel";
import {
  NORMAL_TRICK_SETTLE_MS,
  REDUCED_TRICK_SETTLE_MS,
  NORMAL_TRICK_STACK_MS,
  REDUCED_TRICK_STACK_MS,
  NORMAL_TRICK_COLLECT_MS,
  NORMAL_TRICK_HOLD_MS,
  NORMAL_TRICK_PLAY_SPACING_MS,
  REDUCED_TRICK_COLLECT_MS,
  REDUCED_TRICK_HOLD_MS,
  REDUCED_TRICK_PLAY_SPACING_MS,
} from "@/components/table/trickPresentationModel";

const STORAGE_KEY = "joker:timing-diagnostics:v1";
const SESSION_KEY = "joker:timing-diagnostics:game-id";
const MAX_EVENTS = 800;
let captured: TimingDiagnosticEvent[] = [];
let captureGameId: string | null = null;
let nextSequence = 1;
let persistenceTimer: number | null = null;

type DiagnosticDetails = Record<string, string | number | boolean | null>;

type TimingDiagnosticEvent = {
  seq: number;
  event: string;
  epochMs: number;
  performanceMs: number;
  details: DiagnosticDetails;
};

function browserAvailable(): boolean {
  return typeof window !== "undefined";
}

function readEvents(): TimingDiagnosticEvent[] {
  if (!browserAvailable()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEvents(events: TimingDiagnosticEvent[]): void {
  if (!browserAvailable()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    if (captureGameId) window.localStorage.setItem(SESSION_KEY, captureGameId);
  } catch {
    // Diagnostics must never affect gameplay if storage is unavailable/full.
  }
}

export function flushTimingDiagnostics(): void {
  if (persistenceTimer != null) { window.clearTimeout(persistenceTimer); persistenceTimer = null; }
  if (captured.length) writeEvents(captured);
}
export function startTimingDiagnosticSession(gameId: string): void {
  if (!browserAvailable() || captureGameId === gameId) return;
  captureGameId = gameId; captured = []; nextSequence = 1;
  recordTimingDiagnostic("session_start", { gameId, reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, gameplayDealMotionOverride: "fixed", viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, devicePixelRatio: window.devicePixelRatio });
}
export function recordTimingDiagnostic(event: string, details: DiagnosticDetails = {}): void {
  if (!browserAvailable()) return;
  captured.push({ seq: nextSequence++, event, epochMs: Date.now(), performanceMs: Math.round(performance.now() * 1000) / 1000, details: { ...details } });
  if (captured.length > MAX_EVENTS) captured.splice(0, captured.length - MAX_EVENTS);
  if (persistenceTimer == null) persistenceTimer = window.setTimeout(flushTimingDiagnostics, 500);
}
if (typeof window !== "undefined") window.addEventListener("pagehide", flushTimingDiagnostics);

function activeRuntimeTimings() {
  const browserReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  return {
    reducedMotion: browserReducedMotion,
    gameplayDealMotionOverride: "fixed",
    dealer: {
      cueMs: DEALER_START_CUE_MS,
      spacingMs: DEALER_SELECTION_STAGGER_MS,
      travelMs: DEALER_SELECTION_CARD_TRAVEL_MS,
      winnerHoldMs: DEALER_SELECTION_WINNER_HOLD_MS,
    },
    normalDeal: {
      spacingMs: NORMAL_DEAL_STAGGER_MS,
      travelMs: NORMAL_DEAL_TRAVEL_MS,
      tailMs: NORMAL_DEAL_TAIL_MS,
    },
    trick: {
      playSpacingMs: browserReducedMotion ? REDUCED_TRICK_PLAY_SPACING_MS : NORMAL_TRICK_PLAY_SPACING_MS,
      holdMs: browserReducedMotion ? REDUCED_TRICK_HOLD_MS : NORMAL_TRICK_HOLD_MS,
      collectMs: browserReducedMotion ? REDUCED_TRICK_COLLECT_MS : NORMAL_TRICK_COLLECT_MS,
      cardTransitionMs: browserReducedMotion ? REDUCED_TRICK_SETTLE_MS : NORMAL_TRICK_SETTLE_MS,
      stackMs: browserReducedMotion ? REDUCED_TRICK_STACK_MS : NORMAL_TRICK_STACK_MS,
      localFlightMs: browserReducedMotion ? 75 : 300,
    },
    polling: {
      gameStateMs: 1500,
      dialogueMs: 1000,
    },
  };
}

export function exportTimingDiagnosticsFile(): boolean {
  if (!browserAvailable()) return false;
  const payload = {
    schema: "joker-timing-diagnostics-v1",
    exportedAt: new Date().toISOString(),
    gameId: captureGameId,
    runtime: activeRuntimeTimings(),
    events: captured.length ? captured.slice() : readEvents(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `joker-timing-diagnostics-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
