import { humanDeadlineFromServerTime } from "./controller";
import { legalDeclarationValues } from "./declarations";
import type { CanonicalGameState } from "./gameState";

export type PresentationStage = "full" | "initial" | "remaining";
export interface PresentationBoundary {
  dealNumber: number;
  stage: PresentationStage;
  requiredSeats: number[];
  completedSeats: number[];
}
/** Presentation + a bounded 30s delivery/reconnect allowance, never a gameplay deadline. */
export const PRESENTATION_RECOVERY_ALLOWANCE_MS = 30_000;
export function presentationBoundary(state: CanonicalGameState, stage: PresentationStage): PresentationBoundary {
  return { dealNumber: state.progression.dealNumber, stage, requiredSeats: state.seats.filter(seat => seat.owner.type === "human").map(seat => seat.seatIndex), completedSeats: [] };
}
export function holdOrdinaryDealForPresentation(state: CanonicalGameState, serverNow: string): CanonicalGameState {
  if (state.lifecycle !== "active" || state.progression.phase !== "DECLARATION" || !state.seats.some(seat => seat.owner.type === "human")) return state;
  const duration = state.progression.cardsPerPlayer * 4 * 500 + 320 + 700;
  return { ...state, progression: { ...state.progression, phase: "DEAL_PRESENTATION", currentActorSeat: null }, declarations: { ...state.declarations, currentDeclarerSeat: null, legalValues: [] }, timing: { currentHumanDeadline: null, timeoutTakeoverActive: false, presentationReadyAt: new Date(Date.parse(serverNow) + duration + PRESENTATION_RECOVERY_ALLOWANCE_MS).toISOString(), presentationBoundary: presentationBoundary(state, "full") } };
}
export function activateOrdinaryDealAfterPresentation(state: CanonicalGameState, serverNow: string): CanonicalGameState {
  const actor = state.progression.firstDeclarerSeat, dealer = state.progression.dealerSeat;
  if (state.lifecycle !== "active" || state.progression.phase !== "DEAL_PRESENTATION" || actor == null || dealer == null || state.trump.status !== "resolved") throw new Error("Ordinary presentation barrier is not ready");
  const controller = state.seats[actor].controller;
  return { ...state, stateVersion: state.stateVersion + 1, progression: { ...state.progression, phase: "DECLARATION", currentActorSeat: actor }, declarations: { ...state.declarations, currentDeclarerSeat: actor, legalValues: legalDeclarationValues({ cardsPerPlayer: state.progression.cardsPerPlayer, dealerSeat: dealer, seatIndex: actor, declarations: state.declarations.declarations }) }, timing: { currentHumanDeadline: controller === "human" ? humanDeadlineFromServerTime(serverNow) : null, timeoutTakeoverActive: controller === "temporary_bot", presentationReadyAt: null } };
}
/** Scope by deal/stage, not mutable version; concurrent human acknowledgements use CAS. */
export function acknowledgePresentationBoundary(state: CanonicalGameState, seat: number, dealNumber: number, stage: PresentationStage): { state: CanonicalGameState; allComplete: boolean; replayed: boolean } {
  const expected = state.timing.presentationBoundary ?? presentationBoundary(state, stage);
  const actualStage = state.progression.phase === "DEAL_PRESENTATION" ? "full" : state.progression.phase === "NINE_CARD_INITIAL_DEAL_ALL_SEATS" ? "initial" : state.progression.phase === "NINE_CARD_REMAINING_DEAL" ? "remaining" : null;
  if (state.progression.dealNumber !== dealNumber || expected.dealNumber !== dealNumber || expected.stage !== stage || actualStage !== stage || !expected.requiredSeats.includes(seat)) throw new Error("Stale or invalid presentation acknowledgement");
  if (expected.completedSeats.includes(seat)) return { state, allComplete: expected.requiredSeats.every(index => expected.completedSeats.includes(index)), replayed: true };
  const completedSeats = [...expected.completedSeats, seat].sort();
  return { state: { ...state, stateVersion: state.stateVersion + 1, timing: { ...state.timing, presentationBoundary: { ...expected, completedSeats } } }, allComplete: expected.requiredSeats.every(index => completedSeats.includes(index)), replayed: false };
}
