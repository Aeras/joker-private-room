import { describe, expect, it } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { BiribaMeldZone } from "./BiribaMeldZone";
import type { BiribaMeld } from "./rules";

const first: BiribaMeld = {
  ownerSeat: 0,
  suit: "hearts",
  highAce: false,
  cards: [7, 8, 9].map((rank) => ({
    card: { id: `hearts-${rank}`, suit: "hearts", rank: rank as 7 | 8 | 9 },
    value: rank,
  })),
};

describe("Biriba meld rendering", () => {
  it("retains existing card nodes when a server-confirmed extension arrives", () => {
    const view = render(<BiribaMeldZone melds={[first]} teamName="Κόκκινη ομάδα" />);
    const original = view.container.querySelector('img[alt="7 hearts"]');
    expect(original).not.toBeNull();
    const extended: BiribaMeld = {
      ...first,
      cards: [...first.cards, { card: { id: "hearts-10", suit: "hearts", rank: 10 }, value: 10 }],
    };
    view.rerender(<BiribaMeldZone melds={[extended]} teamName="Κόκκινη ομάδα" />);
    expect(view.container.querySelector('img[alt="7 hearts"]')).toBe(original);
    expect(view.container.querySelectorAll(".biriba-meld-card")).toHaveLength(4);
  });

  it("keeps an arriving card hidden at its destination until the Pixi flight lands", () => {
    const hidden = new Set(["hearts-9"]);
    const view = render(
      <BiribaMeldZone melds={[first]} teamName="Κόκκινη ομάδα" hiddenCardIds={hidden} />,
    );
    const arriving = view.container.querySelector(
      '[data-biriba-card-id="hearts-9"]',
    ) as HTMLImageElement;
    expect(arriving.style.visibility).toBe("hidden");
    expect(
      view.container.querySelector('[data-biriba-card-id="hearts-8"]')?.getAttribute("style"),
    ).toContain("visibility: visible");
    hidden.delete("hearts-9");
    view.rerender(
      <BiribaMeldZone melds={[first]} teamName="Κόκκινη ομάδα" hiddenCardIds={hidden} />,
    );
    expect(arriving.style.visibility).toBe("visible");
  });

  it("shows team numbers 1–6 and 7–12 with availability across both pages", () => {
    const twelve = Array.from({ length: 12 }, () => first);
    const view = render(<BiribaMeldZone melds={twelve} teamName="Κόκκινη ομάδα" highlightedIndices={new Set([0, 7])} />);
    const numbers = () => [...view.container.querySelectorAll(".biriba-meld-number")].map(node => node.textContent);
    expect(numbers()).toEqual(["#1", "#2", "#3", "#4", "#5", "#6"]);
    expect(view.container.querySelectorAll(".biriba-meld-slot--available")).toHaveLength(1);
    const nextPage = view.getByRole("button", { name: /Επόμενες χεριές Κόκκινη ομάδα/ });
    expect(nextPage.className).toContain("biriba-meld-pager-target");
    fireEvent.click(nextPage);
    expect(numbers()).toEqual(["#7", "#8", "#9", "#10", "#11", "#12"]);
    expect(view.container.querySelectorAll(".biriba-meld-slot--available")).toHaveLength(1);
    expect(view.container.querySelector(".biriba-meld-slot--available .biriba-meld-number")?.textContent).toBe("#8");
  });

  it("switches to a hidden page when it has the only legal extension", async () => {
    const twelve = Array.from({ length: 12 }, () => first);
    const view = render(<BiribaMeldZone melds={twelve} teamName="Μπλε ομάδα" highlightedIndices={new Set([8])} />);
    await waitFor(() => expect(view.container.querySelector(".biriba-meld-slot--available .biriba-meld-number")?.textContent).toBe("#9"));
  });
});
