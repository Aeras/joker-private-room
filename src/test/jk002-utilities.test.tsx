import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SoundToggle } from "@/components/table/SoundToggle";
import { getSoundEnabled, setSoundEnabled, SOUND_PREFERENCE_KEY } from "@/lib/soundPreference";
import { playGameSound, resetGameAudioForTests } from "@/lib/gameAudio";
import { mergeLiveTableMessages } from "@/lib/liveTableMessages";
import { Scoreboard } from "@/components/table/Scoreboard";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";

afterEach(() => {
  setSoundEnabled(true);
  localStorage.removeItem(SOUND_PREFERENCE_KEY);
  resetGameAudioForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("JK-002 local sound", () => {
  it("persists a local toggle and suppresses every existing audio event while muted", () => {
    const play = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "Audio",
      class {
        preload = "";
        currentTime = 0;
        play = play;
      },
    );
    render(<SoundToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Ήχος" }));
    expect(getSoundEnabled()).toBe(false);
    expect(localStorage.getItem(SOUND_PREFERENCE_KEY)).toBe("off");
    for (const sound of ["shuffle", "deal", "play"] as const) playGameSound(sound, sound);
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ήχος" }));
    playGameSound("play", "new-event");
    expect(play).toHaveBeenCalledOnce();
    playGameSound("play", "play");
    expect(play).toHaveBeenCalledOnce();
  });
  it("silently survives blocked audio construction and playback", () => {
    vi.stubGlobal(
      "Audio",
      class {
        constructor() {
          throw new Error("blocked");
        }
      },
    );
    expect(() => playGameSound("deal", "blocked")).not.toThrow();
  });
});
describe("JK-002 TTL transport presentation", () => {
  const message = {
    id: "a",
    fromSeat: 0,
    to: "all" as const,
    text: "hello",
    createdAt: "2026-10-04T00:00:00Z",
    expiresAt: "2026-10-04T00:00:05Z",
  };
  it("deduplicates IDs and consumes network delay without restarting the server TTL", () => {
    const first = mergeLiveTableMessages(
      [],
      [message, message],
      "2026-10-04T00:00:01Z",
      1000,
      2000,
    );
    expect(first).toHaveLength(1);
    expect(first[0]!.localExpiresAt).toBe(5000);
    const late = mergeLiveTableMessages(first, [message], "2026-10-04T00:00:03Z", 3000, 4000);
    expect(late[0]!.localExpiresAt).toBe(5000);
    expect(
      mergeLiveTableMessages(late, [message], "2026-10-04T00:00:06Z", 6000, 6000),
    ).toHaveLength(0);
  });
  it("drops messages that expired during a delayed request", () => {
    expect(mergeLiveTableMessages([], [message], "2026-10-04T00:00:04Z", 1000, 3000)).toHaveLength(
      0,
    );
  });
});
describe("JK-002 safe score details", () => {
  it("shows 24 deals, all phases, declarations/tricks and authoritative totals while the deadline keeps counting", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T00:00:00Z"));
    const state = reconciliationFixture();
    state.timing.currentHumanDeadline = "2026-10-04T00:00:30Z";
    state.score.cumulativeTotals = [50, 100, 150, 200];
    const projection = projectGameForSeat(state, 0);
    const { container } = render(
      <Scoreboard
        open
        onClose={() => undefined}
        playerNames={["a", "b", "c", "d"]}
        sheet={{ deals: [], special: [] }}
        projection={projection}
      />,
    );
    expect(container.querySelectorAll("tbody tr")).toHaveLength(28);
    expect(screen.getByRole("status")).toHaveTextContent("30s");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("status")).toHaveTextContent("29s");
    expect(container.textContent).toContain("Δήλωση:");
    expect(container.textContent).toContain("Μπάζες:");
    expect(container.querySelector("tfoot")).toHaveTextContent("200");
    expect(JSON.stringify(projection)).not.toContain("serverEntropySeed");
  });
});
