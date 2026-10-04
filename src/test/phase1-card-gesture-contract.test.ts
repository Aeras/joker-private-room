import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const table = readFileSync("src/components/table/GameTable.tsx", "utf8");
const draggable = readFileSync("src/components/table/DraggableHandCard.tsx", "utf8");

describe("JK-001 Phase 1 — direct card manipulation contract", () => {
  it("removes the normal second Play button and submits the existing semantic command once", () => {
    expect(table).not.toContain(">\n              Παίξε\n");
    expect(table).toContain('await onCommand({ type: "play_card", cardId })');
    expect(table).toContain("playSubmissionLock.current");
  });

  it("keeps authority in the projected legal card list and does not optimistically mutate the hand", () => {
    expect(table).toContain("playAction?.cardIds.includes(cardId)");
    expect(table).toContain("projection.cards.ownHand.map");
    expect(table).not.toMatch(/splice\(|ownHand\s*=|setOwnHand/);
  });

  it("cancels ephemeral drag state on authority, orientation and visibility changes", () => {
    expect(draggable).toContain("[authorityKey]");
    expect(draggable).toContain('window.addEventListener("orientationchange", cancel)');
    expect(draggable).toContain('document.addEventListener("visibilitychange", visibility)');
    expect(draggable).toContain("onPointerCancel");
  });

  it("provides a keyboard/assistive path using the same commit callback and measured release pose", () => {
    expect(draggable).toContain('event.key !== "Enter" && event.key !== " "');
    expect(draggable).toContain('role="button"');
    expect(draggable).toContain("aria-disabled={!canInteract}");
    expect(draggable).toContain("await onCommit(card.id, releaseRect)");
    expect(draggable).toContain("getBoundingClientRect()");
  });

  it("lets the authoritative Joker transition lead into the existing semantic chooser", () => {
    expect(table).toContain('legalAction(projection, "choose_joker_semantic")');
    expect(table).toContain('onCommand({ type: "choose_joker_semantic", semantic })');
    expect(table).toContain('onCommand({ type: "play_card", cardId })');
  });
});
