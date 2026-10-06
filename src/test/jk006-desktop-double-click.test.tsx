import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraggableHandCard } from "@/components/table/DraggableHandCard";
import { shouldCommitCardRelease } from "@/components/table/cardGesture";
import type { Card } from "@/domain/cards";

vi.mock("@/components/joker/PlayingCard", () => ({
  PlayingCard: () => <div data-testid="playing-card" />,
}));

const card: Card = { kind: "standard", id: "h-A", suit: "hearts", rank: "A" };
const rect = { left: 10, top: 20, right: 70, bottom: 110, width: 60, height: 90 };

function view(overrides: Partial<React.ComponentProps<typeof DraggableHandCard>> = {}) {
  const onCommit = vi.fn(async () => undefined);
  const result = render(
    <DraggableHandCard
      card={card}
      legal
      blocked={false}
      pending={false}
      authorityKey="v1"
      zIndex={1}
      overlap={false}
      dropRect={{ left: 0, top: 0, right: 800, bottom: 400, width: 800, height: 400 }}
      onCommit={onCommit}
      {...overrides}
    />,
  );
  const root = result.getByRole("button");
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
  return { ...result, root, onCommit };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("desktop double-click card play", () => {
  it("commits a legal desktop double-click exactly once", async () => {
    const { root, onCommit } = view();
    fireEvent.click(root);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.doubleClick(root, { button: 0 });
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith(card.id, rect);
  });

  it("does not commit an illegal, blocked or pending card", () => {
    for (const props of [
      { legal: false },
      { blocked: true },
      { pending: true },
    ]) {
      const { root, onCommit, unmount } = view(props);
      fireEvent.doubleClick(root, { button: 0 });
      expect(onCommit).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("keeps keyboard Enter/Space on the same commit path", async () => {
    const enter = view();
    fireEvent.keyDown(enter.root, { key: "Enter" });
    await waitFor(() => expect(enter.onCommit).toHaveBeenCalledTimes(1));
    enter.unmount();

    const space = view();
    fireEvent.keyDown(space.root, { key: " " });
    await waitFor(() => expect(space.onCommit).toHaveBeenCalledTimes(1));
  });

  it("retains touch upward drag/flick commit classification", () => {
    expect(shouldCommitCardRelease({
      pointerType: "touch",
      clientX: 100,
      clientY: 100,
      dropRect: null,
      gesture: { deltaX: 4, deltaY: -70, durationMs: 220 },
    })).toBe(true);
  });

  it("does not let a mouse single-release gesture become the desktop play path", () => {
    expect(shouldCommitCardRelease({
      pointerType: "mouse",
      clientX: 900,
      clientY: 500,
      dropRect: { left: 0, top: 0, right: 800, bottom: 400 },
      gesture: { deltaX: 0, deltaY: 0, durationMs: 120 },
    })).toBe(false);
  });
});
