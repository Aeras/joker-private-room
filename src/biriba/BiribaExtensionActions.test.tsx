import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { BiribaExtensionActions, type BiribaExtensionTarget } from "./BiribaExtensionActions";
import { biribaExtensionOptions } from "./extensionOptions";
import type { BiribaCard, BiribaMeld, BiribaRank } from "./rules";

const card = (id: string, rank: number): BiribaCard => ({
  id, rank: rank as BiribaRank, suit: "hearts",
});
const run: BiribaMeld = {
  ownerSeat: 0, suit: "hearts", highAce: false,
  cards: [7, 8, 9].map(value => ({ card: card(`h${value}`, value), value })),
};
const joker: BiribaCard = { id: "wild-joker", joker: true };
const options = biribaExtensionOptions(run, [joker])!;
const targets: BiribaExtensionTarget[] = [
  { index: 0, displayNumber: 1, choices: options },
  { index: 7, displayNumber: 3, choices: options },
  { index: 11, displayNumber: 5, choices: options },
];

describe("Biriba inline wildcard side accordion", () => {
  it("expands inside the selected list item without moving or replacing its target button", () => {
    const onExtend = vi.fn();
    const view = render(<BiribaExtensionActions targets={targets} busy={false} onExtend={onExtend} />);
    const getTarget = (n: number) => view.getByRole("button", { name: `Κόλλημα #${n}` });
    const slots = [...view.container.querySelectorAll(".biriba-extension-item")];
    expect(slots).toHaveLength(3);
    expect(slots.map(slot => slot.querySelector("button")?.textContent)).toEqual([
      "Κόλλημα #1", "Κόλλημα #3", "Κόλλημα #5",
    ]);
    fireEvent.click(getTarget(3));
    expect(getTarget(3).getAttribute("aria-expanded")).toBe("true");
    expect(getTarget(1).getAttribute("aria-expanded")).toBe("false");
    expect(slots[1]!.querySelector(".biriba-extension-choices--open")).not.toBeNull();
    expect(slots[0]!.querySelector(".biriba-extension-choices--open")).toBeNull();
    expect(slots[2]!.querySelector(".biriba-extension-choices--open")).toBeNull();
    const sideButtons = [...slots[1]!.querySelectorAll(".biriba-extension-side")];
    expect(sideButtons.map(button => button.textContent)).toEqual(["Πίσω", "Μπροστά"]);
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(onExtend).not.toHaveBeenCalled();

    fireEvent.click(sideButtons[0]!);
    expect(onExtend).toHaveBeenCalledWith(7, options.behind);
    expect(options.behind?.cards[0]?.value).toBe(6);
    expect(getTarget(3).getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(getTarget(3));
    fireEvent.click(view.getByRole("button", { name: "Μπροστά" }));
    expect(onExtend).toHaveBeenLastCalledWith(7, options.ahead);
    expect(options.ahead?.cards.at(-1)?.value).toBe(10);
    expect(onExtend).toHaveBeenCalledTimes(2);
  });

  it("moves the inline side choices when another target is selected, and toggles closed", () => {
    const view = render(<BiribaExtensionActions targets={targets} busy={false} onExtend={vi.fn()} />);
    const first = view.getByRole("button", { name: "Κόλλημα #1" });
    const third = view.getByRole("button", { name: "Κόλλημα #3" });
    fireEvent.click(first);
    expect(first.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(third);
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(third.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(third);
    expect(third.getAttribute("aria-expanded")).toBe("false");
  });

  it("does not expand for natural cards or wildcards with only one legal endpoint", () => {
    const natural = biribaExtensionOptions(run, [card("ten", 10)])!;
    const onlyRight = biribaExtensionOptions({
      ownerSeat: 0, suit: "hearts", highAce: false,
      cards: [1, 2, 3].map(value => ({ card: card(`low-${value}`, value), value })),
    }, [joker])!;
    const onExtend = vi.fn();
    const view = render(<BiribaExtensionActions targets={[
      { index: 2, displayNumber: 1, choices: natural },
      { index: 4, displayNumber: 2, choices: onlyRight },
    ]} busy={false} onExtend={onExtend} />);
    fireEvent.click(view.getByRole("button", { name: "Κόλλημα #1" }));
    expect(onExtend).toHaveBeenCalledWith(2, natural.automatic);
    fireEvent.click(view.getByRole("button", { name: "Κόλλημα #2" }));
    expect(onExtend).toHaveBeenCalledWith(4, onlyRight.automatic);
    expect(view.container.querySelectorAll(".biriba-extension-choices")).toHaveLength(0);
  });

  it("resets the inline selection when a different hand card is selected", () => {
    const onExtend = vi.fn();
    const view = render(<BiribaExtensionActions key="first-selection" targets={targets} busy={false} onExtend={onExtend} />);
    fireEvent.click(view.getByRole("button", { name: "Κόλλημα #3" }));
    expect(view.getByRole("button", { name: "Κόλλημα #3" }).getAttribute("aria-expanded")).toBe("true");
    view.rerender(<BiribaExtensionActions key="next-selection" targets={targets} busy={false} onExtend={onExtend} />);
    expect(view.getByRole("button", { name: "Κόλλημα #3" }).getAttribute("aria-expanded")).toBe("false");
    expect(onExtend).not.toHaveBeenCalled();
  });

  it("disables all action buttons while an extension is submitting", () => {
    const onExtend = vi.fn();
    const view = render(<BiribaExtensionActions targets={targets} busy={false} onExtend={onExtend} />);
    fireEvent.click(view.getByRole("button", { name: "Κόλλημα #3" }));
    view.rerender(<BiribaExtensionActions targets={targets} busy onExtend={onExtend} />);
    expect((view.getByRole("button", { name: "Κόλλημα #3" }) as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByRole("button", { name: "Πίσω" }) as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByRole("button", { name: "Μπροστά" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
