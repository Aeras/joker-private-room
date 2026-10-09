import { NORMAL_TRICK_HOLD_MS, NORMAL_TRICK_INTER_PLAY_BEAT_MS } from "@/components/table/presentationTiming";
// Architecture wiring checks only; behavioral motion/recovery/barriers are exercised
// in optimization-motion-ownership, ordered-presentation and deal-barriers tests.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projection = readFileSync("src/domain/projection.ts", "utf8");
const table = readFileSync("src/components/table/GameTable.tsx", "utf8");
const seat = readFileSync("src/components/table/TableSeat.tsx", "utf8");
const gesture = readFileSync("src/components/table/DraggableHandCard.tsx", "utf8");
const deal = readFileSync("src/components/table/DealPresentation.tsx", "utf8");
const trick = readFileSync("src/components/table/TrickPresentation.tsx", "utf8");
const declaration = readFileSync("src/components/table/DeclarationPicker.tsx", "utf8");
const audio = readFileSync("src/lib/gameAudio.ts", "utf8");

describe("JK-001 Phase 1 / JK-006 integrated non-asset release gates", () => {
  it("keeps authoritative state and visual perspective separated", () => {
    expect(projection).toContain("viewerSeat: seat");
    expect(table).toContain("const seatAt = (pos: Pos) => ((localSeat + pos) % SEAT_COUNT)");
    expect(table).not.toMatch(/visualPosition.*onCommand|onCommand.*visualPosition/);
  });

  it("shows progress, dealer, local identity and authoritative human deadline together", () => {
    expect(table).toContain("tricksTaken: [...projection.score.tricksTaken]");
    expect(table).toContain("tricksTaken: displayedScore.tricksTaken[seat]");
    expect(table).toContain("if (!active) refreshDisplayedScore()");
    expect(table).toContain("displayedScore.declarations[seat]");
    expect(seat).toContain("<PlayerAvatar");
    expect(seat).toContain("· ΕΣΥ");
    expect(seat).toContain("D");
    expect(seat).toContain("conic-gradient(from 0deg");
    expect(seat).toContain('return "#22c55e"');
    expect(seat).toContain('return "#f59e0b"');
    expect(seat).toContain('return "#ef4444"');
    expect(projection).toContain("currentHumanDeadline: state.timing.currentHumanDeadline");
  });

  it("uses direct manipulation with exactly-once submission and an accessible fallback", () => {
    expect(table).not.toMatch(/>\s*Παίξε\s*</);
    expect(table).toContain("playSubmissionLock.current");
    expect(table).toContain('await onCommand({ type: "play_card", cardId })');
    expect(gesture).toContain("setPointerCapture");
    expect(gesture).toContain('event.key !== "Enter" && event.key !== " "');
    expect(gesture).toContain("onPointerCancel");
  });

  it("preserves Joker semantics after direct play intent", () => {
    expect(table).toContain('legalAction(projection, "choose_joker_semantic")');
    expect(table).toContain('onCommand({ type: "choose_joker_semantic", semantic })');
  });

  it("keeps nine-card dealing private and presentation-only", () => {
    expect(deal).toContain('stage === "initial" ? 12');
    expect(deal).toContain('stage === "remaining" ? 24');
    expect(deal).toContain("<PlayingCard faceDown />");
    expect(deal).not.toContain("projection.cards.deck");
    expect(deal).not.toContain("card.id");
  });

  it("keeps trick winner authoritative and the departing snapshot bounded", () => {
    expect(trick).toContain("new TrickPresentationJournal()");
    expect(trick).not.toContain("completedCount - 1");
    expect(trick).toContain("winnerSeat: active.winnerSeat");
    expect(trick).not.toMatch(/resolveTrick|calculateWinner/);
    expect(trick).toContain("trickPresentationTiming(reducedMotion)");
    expect(NORMAL_TRICK_HOLD_MS).toBe(550);
    expect(NORMAL_TRICK_INTER_PLAY_BEAT_MS).toBe(160);
  });

  it("uses best-effort deduplicated audio with no gameplay dependency", () => {
    expect(audio).toContain("const POOL_SIZE = 4");
    expect(audio).toContain("if (seen.has(eventId)) return false");
    expect(audio).toContain("void audio.play().catch(() => undefined)");
    expect(table).not.toContain("await playGameSound");
  });

  it("supports interruption while keeping dealing timing independent from browser reduced motion", () => {
    expect(gesture).toContain('window.addEventListener("orientationchange"');
    expect(deal).toContain('window.addEventListener("orientationchange", orientation)');
    expect(trick).toContain('window.addEventListener("orientationchange", orientation)');
    expect(deal).not.toContain("motion-reduce:duration-75");
    expect(deal).toContain("dealPresentationTiming(false)");
    expect(trick).toContain("useReducedMotion()");
    expect(deal).toContain("dealPresentationWasCompleted(stageKey)");
    expect(trick).toContain("active?.hydrated");
  });

  it("keeps the declaration panel compact, touchable and server-projected", () => {
    expect(table).toContain("Array.from({ length: 10 }, (_, value) => value)");
    expect(declaration).toContain("grid grid-cols-5");
    expect(declaration).toContain("h-[var(--choice-size)]");
    expect(declaration).toContain("const legal = new Set(legalValues)");
    expect(declaration).toContain("const allowed = legal.has(value)");
    expect(declaration).toContain("disabled={disabled}");
    expect(declaration).toContain('value === 0 ? "Πάσο" : value');
  });
});
