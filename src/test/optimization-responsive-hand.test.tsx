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
  it("uses the requested 250ms entrance without changing final hand depth", () => {
    const view = render(<LocalHandRow cards={cards} visible legalCardIds={[]} blocked pendingCardId={null} authorityKey="timing" geometry={geometry} revealing onCommit={vi.fn()} />);
    const hand = view.container.querySelector<HTMLElement>("[data-hand-entrance]");
    expect(hand?.style.transitionDuration).toBe("250ms");
    act(() => vi.advanceTimersByTime(32));
    expect(hand?.style.transform).toContain("var(--card-w) * 0.52 + 0px");
  });
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
    expect((nodes[0]!.firstElementChild as HTMLElement).style.transform).toBe("rotateY(0deg)");
    act(() => vi.advanceTimersByTime(190));
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
  it.each([[1, "0.18"], [3, "0.18"], [4, "0.28"], [5, "0.28"], [6, "0.36"], [7, "0.36"], [8, "0.42"], [9, "0.42"]])("keeps a large fixed card width for %i cards and varies only overlap", (count, overlap) => {
    const view = render(<LocalHandRow cards={cards.slice(0, Number(count))} visible legalCardIds={[]} blocked pendingCardId={null} authorityKey="large-hand" geometry={geometry} onCommit={vi.fn()} />);
    const lane = view.container.querySelector<HTMLElement>("[data-hand-lane-width]");
    expect(lane?.style.getPropertyValue("--card-w")).toBe("clamp(3.4rem, min(9.6vw, 22vh), 6.75rem)");
    expect(lane?.style.getPropertyValue("--card-overlap")).toBe(overlap);
    expect(view.container.querySelector<HTMLElement>("[data-hand-entrance]")?.style.transform).toContain("var(--card-w) * 0.52");
    if (Number(count) > 1) expect(view.container.querySelectorAll('[role="button"]')[1]?.className).toContain("var(--card-overlap)");
  });
  it("rises face-up while retaining the same mounted cards across polling and resize", () => {
    const props = { cards, visible: true, legalCardIds: [], blocked: true, pendingCardId: null, authorityKey: "first", geometry, onCommit: vi.fn() };
    const view = render(<LocalHandRow {...props} revealing />);
    const hand = view.container.querySelector<HTMLElement>("[data-hand-entrance]");
    const faces = Array.from(view.container.querySelectorAll<HTMLElement>("[data-hand-card] > div"));
    expect(hand?.style.transform).toContain("var(--card-w) * 1.4 + 48px");
    expect(faces.every(face => face.style.transform === "rotateY(0deg)")).toBe(true);
    const lane = view.container.querySelector<HTMLElement>("[data-hand-lane-width]");
    expect(lane?.dataset['handCurrentOverlap']).toBe("0.86");
    act(() => vi.advanceTimersByTime(32));
    expect(hand?.style.transform).not.toContain("1.4 + 48px");
    expect(lane?.dataset['handCurrentOverlap']).toBe("0.42");
    view.rerender(<LocalHandRow {...props} authorityKey="poll" geometry={{...geometry, epoch: 2}} revealing />);
    expect(Array.from(view.container.querySelectorAll<HTMLElement>("[data-hand-card] > div"))).toEqual(faces);
    expect(hand?.getAttribute("data-hand-entrance")).toBe("settled");
    expect(faces.every(face => face.style.transform === "rotateY(0deg)")).toBe(true);
  });
  it.each(["blur", "orientationchange", "visibilitychange"])("finishes face reveal safely on %s", event => {
    const view = render(<LocalHandRow cards={cards} visible legalCardIds={[]} blocked pendingCardId={null} authorityKey="interrupt" geometry={geometry} revealing onCommit={vi.fn()} />);
    fireEvent(event === "visibilitychange" ? document : window, new Event(event));
    expect(Array.from(view.container.querySelectorAll<HTMLElement>("[data-hand-card] > div")).every(face => face.style.transform === "rotateY(0deg)")).toBe(true);
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

