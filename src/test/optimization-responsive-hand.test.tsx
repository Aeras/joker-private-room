import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalHandRow } from "@/components/table/LocalHandRow";
import { DialogueOverlay } from "@/components/table/DialogueOverlay";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import type { Card } from "@/domain/cards";
import type { Room } from "@/domain/players";
vi.mock("@/components/joker/PlayingCard", () => ({
  PlayingCard: ({ card }: { card?: Card }) => <div data-surface={card?.id ?? "back"} />,
}));
const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});
const geometry = {
  ...computeTableGeometry({
    feltRect: rect(28, 32, 512, 202),
    localSeatRect: rect(10, 250, 130, 65),
    viewportWidth: 568,
    viewportHeight: 320,
  }),
  epoch: 1,
};
const cards: Card[] = Array.from({ length: 9 }, (_, i) => ({
  kind: "standard",
  id: `card-${i}`,
  suit: "hearts",
  rank: "A",
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) =>
    window.setTimeout(() => fn(0), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", window.clearTimeout);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("shared local hand geometry", () => {
  it("retains the same cards, overlap and width through reveal to play, with no early input", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const props = {
      cards,
      visible: true,
      legalCardIds: cards.map((c) => c.id),
      blocked: false,
      pendingCardId: null,
      authorityKey: "deal-2",
      geometry,
      onCommit: commit,
    };
    const view = render(<LocalHandRow {...props} revealing />);
    const nodes = Array.from(view.container.querySelectorAll("[data-hand-card]"));
    const width = view.container
      .querySelector<HTMLElement>("[data-hand-lane-width]")!
      .style.getPropertyValue("--card-w");
    fireEvent.keyDown(nodes[0]!.parentElement!, { key: "Enter" });
    expect(commit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(32));
    expect((nodes[0]!.firstElementChild as HTMLElement).style.transform).toBe("rotateY(0deg)");
    view.rerender(<LocalHandRow {...props} revealing={false} />);
    expect(Array.from(view.container.querySelectorAll("[data-hand-card]"))).toEqual(nodes);
    expect(
      view.container
        .querySelector<HTMLElement>("[data-hand-lane-width]")!
        .style.getPropertyValue("--card-w"),
    ).toBe(width);
    expect(nodes[1]!.parentElement!.className).toContain("-ml-");
    fireEvent.keyDown(nodes[0]!.parentElement!, { key: "Enter" });
    expect(commit).toHaveBeenCalledOnce();
  });
  it("cancels both reveal frames when unmounted between frames", () => {
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");
    const view = render(
      <LocalHandRow
        cards={cards.slice(0, 1)}
        visible
        legalCardIds={[]}
        blocked
        pendingCardId={null}
        authorityKey="2"
        geometry={geometry}
        revealing
        onCommit={vi.fn()}
      />,
    );
    act(() => vi.advanceTimersByTime(16));
    view.unmount();
    expect(cancel).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("reserves the measured local-seat lane and keeps trick dimensions height-aware", () => {
    expect(geometry.localHandBounds!.left + geometry.feltRect.left).toBeGreaterThan(140);
    expect(geometry.localHandCenter.x).toBeGreaterThan(geometry.feltRect.width / 2);
    const short = computeTableGeometry({
      feltRect: rect(40, 20, 720, 140),
      topSeatRect: rect(300, 20, 160, 60),
      viewportWidth: 800,
      viewportHeight: 240,
    });
    expect(short.trickCardSize.width).toBeLessThan(48);
    expect(short.trickCardSize.height).toBeCloseTo(short.trickCardSize.width * 1.4);
  });
});
describe("non-obstructing dialogue composer", () => {
  const room = {
    botSettings: { botsTalk: true, aiEnabled: false },
    seats: [{ index: 0, occupant: { type: "bot", bot: { id: "bot-1", displayName: "Bot" } } }],
  } as Room;
  it("is collapsed by default, opens only on request and closes safely", () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const view = render(<DialogueOverlay room={room} messages={[]} busy={false} onSend={send} />);
    expect(view.queryByRole("textbox")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Μήνυμα σε bot" }));
    const input = view.getByRole("textbox");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(send).toHaveBeenCalledWith("bot-1", "hello");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(view.queryByRole("textbox")).toBeNull();
  });
  it("keeps the external-AI disclosure visible in the opened AI composer", () => {
    const view = render(<DialogueOverlay room={{ ...room, botSettings: { ...room.botSettings, aiEnabled: true } }} messages={[]} busy={false} onSend={vi.fn()} />);
    expect(view.queryByText(/εξωτερικό πάροχο AI/)).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Μήνυμα σε bot" }));
    expect(view.getByText(/μπορεί να επεξεργαστεί από εξωτερικό πάροχο AI/)).not.toBeNull();
  });
});
