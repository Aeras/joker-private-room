import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projection = readFileSync("src/domain/projection.ts", "utf8");
const table = readFileSync("src/components/table/GameTable.tsx", "utf8");
const seat = readFileSync("src/components/table/TableSeat.tsx", "utf8");
const gesture = readFileSync("src/components/table/DraggableHandCard.tsx", "utf8");
const deal = readFileSync("src/components/table/DealPresentation.tsx", "utf8");
const trick = readFileSync("src/components/table/TrickPresentation.tsx", "utf8");
const trickModel = readFileSync("src/components/table/trickPresentationModel.ts", "utf8");
const declaration = readFileSync("src/components/table/DeclarationPicker.tsx", "utf8");
const audio = readFileSync("src/lib/gameAudio.ts", "utf8");

describe("JK-001 Phase 1 / JK-006 integrated non-asset release gates", () => {
  it("keeps authoritative state and visual perspective separated", () => {
    expect(projection).toContain("viewerSeat: seat");
    expect(table).toContain("const seatAt = (pos: Pos) => ((localSeat + pos) % SEAT_COUNT)");
    expect(table).not.toMatch(/visualPosition.*onCommand|onCommand.*visualPosition/);
  });

  it("shows progress, dealer, local identity and authoritative human deadline together", () => {
    expect(table).toContain("projection.score.tricksTaken[seat]");
    expect(table).toContain("projection.declarations.values[seat]");
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
    expect(deal).toContain('if (stage === "initial") return 12');
    expect(deal).toContain('if (stage === "remaining") return 24');
    expect(deal).toContain("<PlayingCard faceDown />");
    expect(deal).not.toContain("projection.cards.deck");
    expect(deal).not.toContain("card.id");
  });

  it("keeps trick winner authoritative and the departing snapshot bounded", () => {
    expect(trick).toContain("projection.cards.completedTricks[completedCount - 1]");
    expect(trick).toContain("winnerSeat: trick.winnerSeat");
    expect(trick).not.toMatch(/resolveTrick|calculateWinner/);
    expect(trick).toContain("trickPresentationTiming(reducedMotion)");
    expect(trickModel).toContain("NORMAL_TRICK_HOLD_MS = 850");
    expect(trickModel).toContain("NORMAL_TRICK_INTER_PLAY_BEAT_MS = 1_000");
  });

  it("uses best-effort deduplicated audio with no gameplay dependency", () => {
    expect(audio).toContain("const POOL_SIZE = 4");
    expect(audio).toContain("if (seen.has(eventId)) return false");
    expect(audio).toContain("void audio.play().catch(() => undefined)");
    expect(table).not.toContain("await playGameSound");
  });

  it("supports interruption while keeping dealing timing independent from browser reduced motion", () => {
    expect(gesture).toContain('window.addEventListener("orientationchange"');
    expect(deal).toContain('window.addEventListener("orientationchange", interrupt)');
    expect(trick).toContain('window.addEventListener("orientationchange", interrupt)');
    expect(deal).not.toContain("motion-reduce:duration-75");
    expect(deal).toContain("dealPresentationTiming(false)");
    expect(trick).toContain("prefers-reduced-motion: reduce");
    expect(deal).toContain("dealPresentationWasCompleted(stageKey)");
    expect(trick).toContain("firstRender.current");
  });

  it("keeps the declaration panel compact, touchable and server-projected", () => {
    expect(table).toContain("Array.from({ length: 10 }, (_, value) => value)");
    expect(declaration).toContain("grid grid-cols-5");
    expect(declaration).toContain("h-12");
    expect(declaration).toContain("const legal = new Set(legalValues)");
    expect(declaration).toContain("const allowed = legal.has(value)");
    expect(declaration).toContain("disabled={disabled}");
    expect(declaration).toContain('value === 0 ? "Πάσο" : value');
  });
});