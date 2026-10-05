import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deal = readFileSync("src/components/table/DealPresentation.tsx", "utf8");
const trick = readFileSync("src/components/table/TrickPresentation.tsx", "utf8");
const table = readFileSync("src/components/table/GameTable.tsx", "utf8");
const audio = readFileSync("src/lib/gameAudio.ts", "utf8");

describe("JK-001 Phase 1 / JK-006 presentation authority", () => {
  it("deals only backs from public deal metadata and never reads private deck/card identities", () => {
    expect(deal).toContain("<PlayingCard faceDown />");
    expect(deal).toContain("nextSeat(nextSeat(dealerSeat)");
    expect(deal).not.toContain("projection.cards.deck");
    expect(deal).not.toContain("ownHand.map");
    expect(deal).not.toContain("card.id");
  });

  it("preserves nine-card privacy with explicit 12-card and 24-card presentation barriers", () => {
    expect(deal).toContain('if (stage === "initial") return 12');
    expect(deal).toContain('if (stage === "remaining") return 24');
    expect(deal).toContain('projection.progression.phase === "NINE_CARD_INITIAL_DEAL_ALL_SEATS"');
    expect(deal).toContain('projection.progression.phase === "NINE_CARD_REMAINING_DEAL"');
    expect(deal).toContain('if (presentationStage !== "remaining") playGameSound("shuffle"');
  });

  it("uses session-scoped presentation markers and clears on reconnect/interruption", () => {
    expect(deal).toContain("dealPresentationStorageKey(stageKey)");
    expect(deal).toContain("sessionStorage.setItem(dealPresentationStorageKey(stageKey), \"1\")");
    expect(deal).toContain("dealPresentationWasCompleted(stageKey)");
    expect(deal).toContain("for (const timer of timers.current) window.clearTimeout(timer)");
    expect(deal).toContain('window.addEventListener("orientationchange", interrupt)');
    expect(deal).toContain('document.addEventListener("visibilitychange", visibility)');
  });

  it("animates deal backs from true felt-center geometry and committed cards from measured seat origins", () => {
    expect(deal).toContain("window.requestAnimationFrame(() => setArrived(true))");
    expect(deal).toContain("geometry.dealCenter");
    expect(deal).toContain("geometry.dealTargets[pos]");
    expect(trick).toContain("geometry?.seatOrigins[pos]");
    expect(trick).toContain("geometry.trickSlots[pos]");
    expect(trick).toContain("window.requestAnimationFrame(() => setArrived(true))");
  });

  it("derives departing trick winner only from authoritative completedTricks", () => {
    expect(trick).toContain("projection.cards.completedTricks[completedCount - 1]");
    expect(trick).toContain("winnerSeat: trick.winnerSeat");
    expect(trick).not.toMatch(/resolveTrick|calculateWinner/);
    expect(trick).toContain("winnerSeat === play.seatIndex");
    expect(trick).toContain("pendingCompletion.current");
    expect(trick).toContain("setDeparting");
  });

  it("paces committed plays through one bounded queue and deduplicates play audio identities", () => {
    expect(trick).toContain("function acceptedPlayEventId");
    expect(trick).toContain("queueRef.current");
    expect(trick).toContain("playSpacingMs");
    expect(trick).toContain('playGameSound("play"');
    expect(table).not.toContain('playGameSound("play"');
    const draggable = readFileSync("src/components/table/DraggableHandCard.tsx", "utf8");
    expect(draggable).not.toContain("playGameSound");
  });

  it("keeps audio bounded, deduplicated and failure-safe", () => {
    expect(audio).toContain("const POOL_SIZE = 4");
    expect(audio).toContain("const MAX_SEEN_EVENTS = 256");
    expect(audio).toContain("if (seen.has(eventId)) return false");
    expect(audio).toContain("void audio.play().catch(() => undefined)");
    expect(audio).not.toContain("throw new Error");
  });

  it("integrates measured presentation layers without changing gameplay command semantics", () => {
    expect(table).toContain("<TrickPresentation");
    expect(table).toContain("<DealPresentation");
    expect(table).toContain("geometry={tableGeometry.geometry}");
    expect(table).toContain("paused={dealerIntroActive}");
    expect(table).toContain('await onCommand({ type: "play_card", cardId })');
  });
});