import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { BiribaDiscardPileTrigger, BiribaDiscardsDialog } from "./BiribaDiscardPile";
import { BIRIBA_DISCARD_RECT, biribaVisualCards } from "./biribaVisualModel";
import type { BiribaCard } from "./rules";

const discarded: BiribaCard[] = [
  { id: "first", suit: "diamonds", rank: 6 },
  { id: "second", suit: "spades", rank: 13 },
  { id: "third", joker: true },
];

describe("Biriba discarded pile inspection", () => {
  it("shows actual card artwork in chronological discard order with only a small heading", () => {
    const onClose = vi.fn();
    const view = render(<BiribaDiscardsDialog cards={discarded} onClose={onClose} />);
    expect(view.getByRole("dialog", { name: "Πεταμένα φύλλα" })).toBeTruthy();
    expect(view.getByRole("heading", { name: "Πεταμένα φύλλα (3)" })).toBeTruthy();
    const cards = [...view.container.querySelectorAll(".biriba-discard-dialog-card")] as HTMLImageElement[];
    expect(cards).toHaveLength(3);
    expect(cards.map(card => card.getAttribute("src"))).toEqual([
      "/cards/optimized-png/faces/diamonds_6.png",
      "/cards/optimized-png/faces/spades_king.png",
      "/cards/optimized-png/faces/joker_red.png",
    ]);
    expect(cards.map(card => card.getAttribute("alt"))).toEqual([
      "6 καρό", "13 μπαστούνι", "Τζόκερ",
    ]);
    expect(view.container.textContent).toBe("Πεταμένα φύλλα (3)");
    expect(view.container.querySelectorAll(".biriba-discard-pickup-actions button")).toHaveLength(0);
    fireEvent.click(cards[0]!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on background tap, close X, and Escape without acting on the card itself", () => {
    const onClose = vi.fn();
    const view = render(<BiribaDiscardsDialog cards={discarded} onClose={onClose} />);
    const backdrop = view.getByTestId("biriba-discard-backdrop");
    const dialog = view.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole("button", { name: "Κλείσιμο πεταμένων" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
    view.unmount();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("aligns the interactive hitbox precisely with the Pixi discard sprite", () => {
    const visual = biribaVisualCards({
      seats: 2, seat: 0, roundNumber: 1, revision: 1,
      stockCount: 20, packetCounts: [11, 11], handCounts: [11, 11],
      discards: discarded,
    });
    const pixiCard = visual.find(card => card.id === "discard:top");
    expect(pixiCard).toMatchObject(BIRIBA_DISCARD_RECT);
    const onOpen = vi.fn();
    const view = render(<BiribaDiscardPileTrigger visible={false} onOpen={onOpen} />);
    expect(view.container.querySelector("button")).toBeNull();
    view.rerender(<BiribaDiscardPileTrigger visible onOpen={onOpen} />);
    const trigger = view.getByRole("button", { name: /Προβολή πεταμένων φύλλων πατώντας τη στοίβα/ });
    expect(trigger.getAttribute("style")).toContain(`left: ${(pixiCard!.x / 1280) * 100}%`);
    expect(trigger.getAttribute("style")).toContain(`top: ${(pixiCard!.y / 720) * 100}%`);
    expect(trigger.getAttribute("style")).toContain(`width: ${(pixiCard!.width / 1280) * 100}%`);
    expect(trigger.getAttribute("style")).toContain(`height: ${(pixiCard!.height / 720) * 100}%`);
    fireEvent.click(trigger);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("allows explicit pickup choices only when provided by the caller", () => {
    const onClose = vi.fn();
    const view = render(
      <BiribaDiscardsDialog cards={discarded} onClose={onClose}>
        <div className="biriba-discard-pickup-actions">
          <button type="button">Πάρε με 6♦</button>
        </div>
      </BiribaDiscardsDialog>,
    );
    expect(view.getByRole("button", { name: "Πάρε με 6♦" })).toBeTruthy();
  });
});
