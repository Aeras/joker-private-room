import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogueOverlay } from "@/components/table/DialogueOverlay";
import type { Room } from "@/domain/players";
import type { DialogueMessage } from "@/services/dialogueFunctions";
const room = { code: "TEST", hostId: "host", rulesetId: "popular", status: "playing", botSettings: { botsTalk: true, aiEnabled: false, allowProfanity: false, intensity: "normal" }, seats: [{ index: 0, occupant: { type: "bot", bot: { id: "bot", displayName: "Bot" } } }] } as Room;
const message = (id: string): DialogueMessage => ({ id, eventId: id, speakerBotId: "bot", targetSeat: null, text: `Message ${id}`, source: "preset", replyDepth: 0, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 8000).toISOString() });
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("bot dialogue display duration", () => {
  it("expires after four seconds without waiting for a poll", () => {
    render(<DialogueOverlay room={room} messages={[message("a")]} busy={false} onSend={vi.fn()} />);
    act(() => vi.advanceTimersByTime(3999)); expect(screen.getByText(/Message a/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1)); expect(screen.queryByText(/Message a/)).not.toBeInTheDocument();
  });
  it("does not extend or replay messages when polling returns new objects", () => {
    const first = message("a"); const props = { room, busy: false, onSend: vi.fn() };
    const view = render(<DialogueOverlay {...props} messages={[first]} />);
    act(() => vi.advanceTimersByTime(3000));
    view.rerender(<DialogueOverlay {...props} messages={[{ ...first }, message("b")]} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText(/Message a/)).not.toBeInTheDocument(); expect(screen.getByText(/Message b/)).toBeInTheDocument();
    view.rerender(<DialogueOverlay {...props} messages={[{ ...first }]} />);
    expect(screen.queryByText(/Message a/)).not.toBeInTheDocument();
  });
});
