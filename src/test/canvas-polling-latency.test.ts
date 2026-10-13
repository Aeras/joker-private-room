import { describe, expect, it, vi } from "vitest";
import { tablePollInterval } from "@/components/table/tablePolling";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";

describe("bounded remote human observation latency", () => {
  it.each(["popular", "classic", "minus"] as const)(
    "uses the same policy in %s without changing bot or local waits",
    (ruleset) => {
      const p = projectGameForSeat(reconciliationFixture(ruleset), 0);
      p.progression.phase = "CARD_PLAY";
      p.progression.currentActorSeat = 1;
      p.seats[1].controller = "human";
      expect(tablePollInterval(p)).toBe(350);
      p.progression.currentActorSeat = 0;
      p.seats[0].controller = "human";
      expect(tablePollInterval(p)).toBe(1500);
      p.seats[0].controller = "permanent_bot";
      expect(tablePollInterval(p)).toBe(200);
      p.lifecycle = "complete";
      expect(tablePollInterval(p)).toBe(1500);
      expect(tablePollInterval(null)).toBe(1500);
    },
  );
  it("reduces only the simulated polling wait, with transport time unchanged", () => {
    vi.useFakeTimers();
    try {
      const p = projectGameForSeat(reconciliationFixture(), 0);
      p.progression.phase = "CARD_PLAY";
      p.progression.currentActorSeat = 1;
      p.seats[1].controller = "human";
      let accepted = false,
        detected = 0;
      setTimeout(() => {
        accepted = true;
      }, 50);
      const timer = setInterval(() => {
        if (accepted && !detected) detected = Date.now();
      }, tablePollInterval(p));
      const start = Date.now();
      vi.advanceTimersByTime(350);
      clearInterval(timer);
      expect(detected - start).toBe(350);
      expect(1500 - (detected - start)).toBe(1150);
      // No production network or physical-device latency is inferred from this clock test.
    } finally {
      vi.useRealTimers();
    }
  });
});
