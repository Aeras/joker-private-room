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
describe("JK-002 classic score sheet", () => {
  it("starts as a 24-deal blank sheet with the canonical 1-8, four 9s, 8-1, four 9s schedule", () => {
    const projection = projectGameForSeat(reconciliationFixture(), 0);
    const { container } = render(
      <Scoreboard
        open
        onClose={() => undefined}
        playerNames={["Νίκος", "Μιχάλης", "Παναγιώτης", "Bot"]}
        projection={projection}
      />,
    );

    const dealRows = Array.from(container.querySelectorAll("[data-score-deal]"));
    expect(dealRows).toHaveLength(24);
    expect(dealRows.map(row => row.querySelector("th")?.textContent)).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8",
      "9", "9", "9", "9",
      "8", "7", "6", "5", "4", "3", "2", "1",
      "9", "9", "9", "9",
    ]);
    expect(screen.getByText("Νίκος")).toBeInTheDocument();
    expect(container.querySelector("[data-score-points='1:0']")?.textContent).toBe("");
    expect(container.querySelector("[data-score-declaration='1:0']")?.textContent).toBe("");
    expect(container.querySelectorAll("[data-score-summary]")).toHaveLength(7);
    expect(container.querySelector("[data-score-summary='1:round']")).not.toBeNull();
    expect(container.querySelector("[data-score-summary='1:cumulative']")).toBeNull();
    expect(container.querySelector("[data-score-summary='2:cumulative']")).not.toBeNull();
    expect(container.querySelector("[data-score-summary='1:round']")?.textContent?.replace(/\s/g, "")).toBe("Γ");
    expect(container.querySelector("[aria-label='Τελική κατάταξη']")).toBeNull();
    expect(JSON.stringify(projection)).not.toContain("serverEntropySeed");
  });

  it("renders pass/declaration, authoritative score, premia tick, removal strike and final ranking", () => {
    const state = reconciliationFixture();
    state.lifecycle = "complete";
    state.progression.phase = "GAME_COMPLETE";
    state.score.completedDeals = [
      {
        dealNumber: 9,
        round: 2,
        indexInPhase: 1,
        cardsPerPlayer: 9,
        declarations: [0, 4, 2, 1],
        tricksTaken: [0, 4, 1, 2],
        dealScores: [50, 400, 10, 20],
        totalsAfterDeal: [50, 400, 10, 20],
      },
      {
        dealNumber: 10,
        round: 2,
        indexInPhase: 2,
        cardsPerPlayer: 9,
        declarations: [1, 5, 2, 1],
        tricksTaken: [1, 5, 2, 1],
        dealScores: [100, 500, 150, 100],
        totalsAfterDeal: [150, 900, 160, 120],
      },
      {
        dealNumber: 11,
        round: 2,
        indexInPhase: 3,
        cardsPerPlayer: 9,
        declarations: [2, 2, 3, 1],
        tricksTaken: [2, 2, 3, 1],
        dealScores: [150, 150, 200, 100],
        totalsAfterDeal: [300, 1050, 360, 220],
      },
      {
        dealNumber: 12,
        round: 2,
        indexInPhase: 4,
        cardsPerPlayer: 9,
        declarations: [3, 1, 1, 2],
        tricksTaken: [3, 1, 1, 2],
        dealScores: [200, 100, 100, 150],
        totalsAfterDeal: [500, 1150, 460, 370],
      },
    ];
    state.score.roundPremia = [
      {
        round: 2,
        qualified: [false, true, false, false],
        adjustments: [0, 500, -200, 0],
        transfers: [
          {
            bonusSeat: 1,
            bonusDealIndex: 2,
            bonusAmount: 500,
            targetSeat: 2,
            removedDealIndex: 3,
            removedAmount: 200,
          },
        ],
        totalsAfterPremia: [500, 1650, 260, 370],
      },
    ];
    state.score.cumulativeTotals = [500, 1650, 260, 370];
    state.score.finalPlacements = [2, 1, 4, 3];

    const projection = projectGameForSeat(state, 0);
    const { container } = render(
      <Scoreboard
        open
        onClose={() => undefined}
        playerNames={["Νίκος", "Μιχάλης", "Παναγιώτης", "Bot"]}
        projection={projection}
      />,
    );

    expect(container.querySelector("[data-score-declaration='9:0']")?.textContent).toBe("—");
    expect(container.querySelector("[data-score-declaration='9:1']")?.textContent).toBe("4");
    expect(container.querySelector("[data-score-points='10:1']")?.textContent).toContain("500");
    expect(container.querySelector("[data-score-points='10:1']")?.textContent).toContain("✓");
    expect(container.querySelector("[data-score-points='11:2'] span")?.className).toContain("line-through");
    expect(container.querySelector("[data-score-summary='2:round']")?.textContent).toContain("1650");
    expect(container.querySelector("[data-score-summary='2:cumulative']")?.textContent).toContain("1650");
    expect(container.querySelector("[data-final-placement='1']")?.textContent).toContain("Μιχάλης");
    expect(container.querySelector("[data-final-placement='2']")?.textContent).toContain("Νίκος");
  });
});
