import { act, cleanup, render, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameTable } from "@/components/table/GameTable";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import { retryCommandDelivery } from "@/components/table/retryCommandDelivery";
import type { RectLike } from "@/components/table/useTableGeometry";
import type { ComponentProps } from "react";
import type { Room } from "@/domain/players";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
vi.mock("@/components/table/useCriticalCardArtwork", () => ({
  useCriticalCardArtwork: () => true,
}));
vi.mock("@/components/table/DealerSelectionPresentation", () => ({
  DealerSelectionPresentation: () => null,
}));
vi.mock("@/components/table/DealPresentation", () => ({ DealPresentation: () => null }));
vi.mock("@/components/table/Scoreboard", () => ({ Scoreboard: () => null }));
vi.mock("@/components/table/SoundToggle", () => ({ SoundToggle: () => null }));
vi.mock("@/components/table/TableUtilityMenu", () => ({ TableUtilityMenu: () => null }));
vi.mock("@/components/table/useTableGeometry", async (importOriginal) => {
  const module = await importOriginal<typeof import("@/components/table/useTableGeometry")>();
  return {
    ...module,
    useTableGeometry: () => ({
      geometry: {
        ...module.computeTableGeometry({
          feltRect: { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 },
          viewportWidth: 1280,
          viewportHeight: 800,
        }),
        epoch: 1,
      },
    }),
  };
});

const callback = vi.hoisted(() => ({
  commit: null as null | ((id: string, rect: RectLike) => Promise<void>),
}));
vi.mock("@/components/table/LocalHandRow", () => ({
  LocalHandRow: (
    props: ComponentProps<typeof import("@/components/table/LocalHandRow").LocalHandRow>,
  ) => {
    callback.commit = props.onCommit;
    return <div />;
  },
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
it.each(["accepted", "rejected", "same-version", "tail"])(
  "lost transport response recovers safely: %s",
  async (outcome) => {
    const state = reconciliationFixture();
    state.progression.phase = "CARD_PLAY";
    const projection = projectGameForSeat(state, 0);
    projection.initialDealerSelection = {
      status: "pending",
    } as typeof projection.initialDealerSelection;
    const card = { id: "network-test", kind: "standard", suit: "spades", rank: "A" } as const;
    projection.cards.currentTrick = [];
    projection.cards.completedTricks = [];
    projection.cards.ownHand = [card];
    projection.cards.ownHandVisible = true;
    projection.local.legalActions = [{ type: "play_card", cardIds: [card.id] }];
    const room = {
      code: "TEST",
      hostId: "host",
      seats: state.seats.map((_, index) => ({
        index,
        occupant: { type: "bot", bot: { id: String(index), displayName: `Seat ${index}` } },
      })),
    } as Room;
    const props = {
      room,
      projection,
      busy: false,
      error: null,
      onCommand: vi.fn(async () => {
        throw new Error("Transport lost response");
      }),
      onReclaim: vi.fn(),
      onEndGame: vi.fn(),
      onNineCardPresentationComplete: vi.fn(),
    };
    const v = render(<GameTable {...props} />);
    act(() => vi.advanceTimersByTime(1000));
    await act(async () => {
      await callback.commit!(card.id, {
        left: 0,
        top: 300,
        right: 70,
        bottom: 398,
        width: 70,
        height: 98,
      });
    });
    expect(props.onCommand).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(1000));
    expect(v.container.querySelector('[data-local-flight-status="submitted"]')).not.toBeNull();
    const next = structuredClone(projection);
    if (outcome !== "same-version") next.stateVersion++;
    if (outcome === "accepted") {
      next.cards.ownHand = [];
      next.cards.currentTrick = [{ seatIndex: 0, card }];
    }
    if (outcome === "tail") {
      next.progression.dealNumber++;
      next.cards.ownHand = [];
      next.cards.presentationTail = [
        {
          dealNumber: projection.progression.dealNumber,
          ordinal: 1,
          winnerSeat: 0,
          cards: [{ seatIndex: 0, card }],
        },
      ];
    }
    v.rerender(<GameTable {...props} projection={next} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(Boolean(v.container.querySelector('[data-local-flight-status="submitted"]'))).toBe(
      outcome === "same-version",
    );
    if (outcome === "accepted")
      expect(v.container.querySelectorAll('[data-trick-seat="0"]')).toHaveLength(1);
    expect(props.onCommand).toHaveBeenCalledOnce();
  },
);

it("delivery retry preserves the exact action ID and version envelope", async () => {
  const input = { data: { actionId: "same-action", expectedStateVersion: 7 } };
  const send = vi.fn().mockRejectedValueOnce(new Error("lost")).mockResolvedValueOnce({ ok: true });
  await expect(retryCommandDelivery(send, input)).resolves.toEqual({ ok: true });
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0]![0]).toBe(input);
  expect(send.mock.calls[1]![0]).toBe(input);
});
it("explicit server rejection is not retried", async () => {
  const send = vi.fn().mockResolvedValue({ ok: false });
  await retryCommandDelivery(send, {});
  expect(send).toHaveBeenCalledOnce();
});
it("transport retries are bounded", async () => {
  const send = vi.fn().mockRejectedValue(new Error("offline"));
  await expect(retryCommandDelivery(send, {})).rejects.toThrow("offline");
  expect(send).toHaveBeenCalledTimes(2);
});

it.each(["LEAD", "COMPETE", "FROM_BELOW"] as const)("opens Joker choices before flight, mode=%s", async mode => {
  const open = mode !== "LEAD";
  const state = reconciliationFixture();
  state.progression.phase = "CARD_PLAY";
  state.progression.currentActorSeat = 0;
  state.seats[0].owner = { type: "human", playerId: "human-test" }; state.seats[0].controller = "human";
  state.cards.hands[0] = [{ id: "choice-joker", kind: "joker" }];
  state.cards.currentTrick = open ? [{ seatIndex: 3, card: { id: "lead", kind: "standard", suit: "clubs", rank: "A" } }] : [];
  delete state.timing.turnPresentation;
  const projection = projectGameForSeat(state, 0);
  projection.initialDealerSelection = { status: "pending" } as typeof projection.initialDealerSelection;
  const room = { code: "TEST", seats: state.seats.map((_, index) => ({ index, occupant: { type: "bot", bot: { id: String(index), displayName: `Seat ${index}` } } })) } as Room;
  let resolve: (value: typeof projection | null) => void;
  const onCommand = vi.fn(() => {
    expect(document.querySelector("[data-joker-choice-position]")).toBeNull();
    expect(document.querySelector("[data-local-flight-card]")).not.toBeNull();
    return new Promise<typeof projection | null>(done => { resolve = done; });
  });
  const view = render(<GameTable room={room} projection={projection} busy={false} error={null} onCommand={onCommand} onReclaim={vi.fn()} onEndGame={vi.fn()} onNineCardPresentationComplete={vi.fn()} />);
  act(() => vi.advanceTimersByTime(1500));
  await act(async () => { await callback.commit!("choice-joker", { left: 300, top: 500, right: 370, bottom: 598, width: 70, height: 98 }); });
  expect(onCommand).not.toHaveBeenCalled();
  expect(view.container.querySelector("[data-local-flight-card]")).toBeNull();
  const choice = open ? view.getByText(mode === "FROM_BELOW" ? "Τζόκερ από κάτω" : "Τζόκερ από πάνω") : view.getByLabelText("Θέλω μεγαλύτερο μπαστούνια");
  fireEvent.click(choice);
  expect(view.container.querySelector("[data-joker-choice-position]")).toBeNull();
  expect(view.container.querySelector("[data-local-flight-card]")).not.toBeNull();
  expect(onCommand).toHaveBeenCalledExactlyOnceWith({ type: "play_card", cardId: "choice-joker", jokerSemantic: open ? { context: "OPEN_TRICK", mode } : { context: "LEAD", mode: "HIGHER_SUIT", requestedSuit: "spades" } });
  if (mode === "FROM_BELOW") {
    expect(view.container.querySelector('[data-joker-under-flip="face"]')).not.toBeNull();
    act(() => vi.advanceTimersByTime(16));
    expect(view.container.querySelector('[data-joker-under-flip="back"]')).not.toBeNull();
  }
  await act(async () => resolve!(null));
  expect(view.container.querySelector('[data-local-flight-status="rejected"]')).not.toBeNull();
});

