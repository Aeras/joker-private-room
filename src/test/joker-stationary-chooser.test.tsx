import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraggableHandCard } from "@/components/table/DraggableHandCard";
import { JokerChoicePicker } from "@/components/table/JokerChoicePicker";
import type { Card } from "@/domain/cards";

vi.mock("@/components/joker/PlayingCard", () => ({ PlayingCard: () => <div data-testid="playing-card" /> }));

const joker = { kind: "joker", id: "joker-1" } as unknown as Card;
const ace: Card = { kind: "standard", id: "h-A", suit: "hearts", rank: "A" };

function card(c: Card, extra: Partial<ComponentProps<typeof DraggableHandCard>> = {}) {
  const onCommit = vi.fn(async () => undefined);
  const r = render(<DraggableHandCard card={c} legal blocked={false} pending={false} authorityKey="v1" zIndex={1} overlap={false}
    dropRect={{ left: 0, top: 0, right: 800, bottom: 400, width: 800, height: 400 }} onCommit={onCommit} {...extra} />);
  const root = r.getByRole("button");
  root.setPointerCapture = vi.fn(); root.releasePointerCapture = vi.fn();
  return { ...r, root, onCommit };
}

const lead = [
  { context: "LEAD", mode: "HIGHER_SUIT", requestedSuit: "hearts" },
  { context: "LEAD", mode: "SUIT_WINS", requestedSuit: "spades" },
] as never[];
const open = [{ context: "OPEN_TRICK", mode: "COMPETE" }, { context: "OPEN_TRICK", mode: "FROM_BELOW" }] as never[];

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Joker stays stationary until a semantic is chosen", () => {
  it("does not translate or scale the Joker during a touch drag, but still requests the chooser", async () => {
    const { root, onCommit } = card(joker);
    fireEvent.pointerDown(root, { pointerId: 1, button: 0, pointerType: "touch", clientX: 100, clientY: 300 });
    fireEvent.pointerMove(root, { pointerId: 1, pointerType: "touch", clientX: 110, clientY: 200 });
    expect(root.style.transform).toBe("");
    expect(root.className).not.toContain("z-[100]");
    fireEvent.pointerUp(root, { pointerId: 1, pointerType: "touch", clientX: 110, clientY: 200 });
    await waitFor(() => expect(onCommit).toHaveBeenCalledOnce());
    expect(onCommit.mock.calls[0]![1]).toMatchObject({ rotation: 0 });
  });

  it("keeps a casual short touch from opening the chooser", async () => {
    const { root, onCommit } = card(joker);
    fireEvent.pointerDown(root, { pointerId: 1, button: 0, pointerType: "touch", clientX: 100, clientY: 300 });
    fireEvent.pointerUp(root, { pointerId: 1, pointerType: "touch", clientX: 102, clientY: 292 });
    await new Promise(r => setTimeout(r, 30));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("leaves normal cards' drag transform unchanged", () => {
    const { root } = card(ace);
    fireEvent.pointerDown(root, { pointerId: 1, button: 0, pointerType: "touch", clientX: 100, clientY: 300 });
    fireEvent.pointerMove(root, { pointerId: 1, pointerType: "touch", clientX: 110, clientY: 200 });
    expect(root.style.transform).toContain("translate3d(10px, -100px, 0)");
  });
});

describe("Joker chooser dismissal and selection", () => {
  it("outside click dismisses, consumes the event, and never selects", () => {
    const under = vi.fn(); const onSelect = vi.fn(); const onDismiss = vi.fn();
    const r = render(<div onClick={under} onPointerDown={under}><JokerChoicePicker options={open} busy={false} onSelect={onSelect} onDismiss={onDismiss} /></div>);
    const catcher = r.container.querySelector("[data-joker-choice-dismiss]")!;
    fireEvent.pointerDown(catcher); fireEvent.click(catcher);
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    expect(under).not.toHaveBeenCalled();
  });

  it("Escape dismisses", () => {
    const onDismiss = vi.fn();
    render(<JokerChoicePicker options={open} busy={false} onSelect={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("selects open-trick choices on the first click", () => {
    const onSelect = vi.fn();
    const r = render(<JokerChoicePicker options={open} busy={false} onSelect={onSelect} onDismiss={vi.fn()} />);
    fireEvent.click(r.getByText("Τζόκερ από πάνω"));
    expect(onSelect).toHaveBeenCalledWith(open[0]);
    fireEvent.click(r.getByText("Τζόκερ από κάτω"));
    expect(onSelect).toHaveBeenLastCalledWith(open[1]);
  });

  it("selects lead choices on the first click", () => {
    const onSelect = vi.fn();
    const r = render(<JokerChoicePicker options={lead} busy={false} onSelect={onSelect} onDismiss={vi.fn()} />);
    fireEvent.click(r.getByLabelText("Θέλω μεγαλύτερο κούπες"));
    expect(onSelect).toHaveBeenCalledWith(lead[0]);
    fireEvent.click(r.getByLabelText("Παίρνουν μπαστούνια"));
    expect(onSelect).toHaveBeenLastCalledWith(lead[1]);
  });

  it("renders no dimming catcher for the post-play authoritative chooser", () => {
    const r = render(<JokerChoicePicker options={open} busy={false} onSelect={vi.fn()} />);
    expect(r.container.querySelector("[data-joker-choice-dismiss]")).toBeNull();
    const picker = readFileSync("src/components/table/JokerChoicePicker.tsx", "utf8");
    expect(picker).not.toMatch(/data-joker-choice-dismiss[^>]*bg-/);
  });

  it("GameTable only dismisses the pre-play intent and blocks the hand while open", () => {
    const table = readFileSync("src/components/table/GameTable.tsx", "utf8");
    expect(table).toContain("onDismiss={jokerIntent ? dismissJokerIntent : undefined}");
    expect(table).toContain("Boolean(jokerIntent)");
  });
});
