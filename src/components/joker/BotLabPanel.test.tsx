import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BotLabPanel, type LabJobView, type LabListView } from "./BotLabPanel";
import { latencyInterval } from "@/lib/botLabStatistics";
const job: LabJobView = {
  id: "test-job",
  status: "running",
  config: { games: 10, seed: 81, ruleset: "popular", compare: false, lineup: null },
  total_games: 10,
  completed_games: 2,
  started_games: 3,
  created_at: "2026-10-09T00:00:00Z",
  updated_at: "2026-10-09T00:00:00Z",
  errors: 0,
  last_error: null,
  currentDeal: 9,
  currentStep: 200,
};
const initial: LabListView = { jobs: [job], workerEnabled: true };
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("shows database progress without incrementing it using browser time", async () => {
  vi.useFakeTimers();
  const api = vi.fn().mockResolvedValue(initial);
  render(<BotLabPanel initial={initial} api={api} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(12000);
  });
  expect(screen.getByRole("progressbar")).toHaveAttribute("value", "2");
  expect(api).toHaveBeenCalledWith("list");
  expect(screen.getByRole("button", { name: "Έναρξη benchmark" })).toBeDisabled();
});
it("does not poll a disabled/idle Lab or start fake work", async () => {
  vi.useFakeTimers();
  const api = vi.fn();
  render(<BotLabPanel initial={{ jobs: [], workerEnabled: false }} api={api} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(api).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Έναρξη benchmark" })).toBeDisabled();
});
it("creates the selected real benchmark configuration", async () => {
  const api = vi.fn().mockResolvedValue(job);
  render(<BotLabPanel initial={{ jobs: [], workerEnabled: true }} api={api} />);
  fireEvent.change(screen.getByLabelText("Παιχνίδια"), { target: { value: "1000" } });
  fireEvent.change(screen.getByLabelText("Παραλλαγή"), { target: { value: "classic" } });
  fireEvent.click(screen.getByLabelText("Σύγκριση competitive-v2 με baseline"));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Έναρξη benchmark" }));
  });
  expect(api).toHaveBeenCalledWith("create", {
    requestId: expect.any(String),
    config: { games: 1000, seed: 810000, ruleset: "classic", compare: true, lineup: null },
  });
});
it("fences an old poll response after durable cancellation", async () => {
  vi.useFakeTimers();
  let resolvePoll!: (v: unknown) => void;
  const api = vi.fn().mockImplementation((action) =>
    action === "list"
      ? new Promise((resolve) => {
          resolvePoll = resolve;
        })
      : Promise.resolve({ ...job, status: "cancelled" }),
  );
  render(<BotLabPanel initial={initial} api={api} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Ακύρωση εργασίας" }));
  });
  await act(async () => {
    resolvePoll(initial);
  });
  expect(screen.queryByRole("button", { name: "Ακύρωση εργασίας" })).not.toBeInTheDocument();
  expect(api).toHaveBeenCalledWith("cancel", { jobId: "test-job" });
  expect(screen.getByRole("progressbar")).toHaveAttribute("value", "2");
});
it("admits no overlapping polls while a request is pending", async () => {
  vi.useFakeTimers();
  const api = vi.fn().mockReturnValue(new Promise(() => {}));
  render(<BotLabPanel initial={initial} api={api} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20000);
  });
  expect(api).toHaveBeenCalledTimes(1);
});
it("reports histogram quantile intervals and bounded overflow honestly", () => {
  expect(latencyInterval([0, 9, 1], [1, 2], 0.5)).toBe("1–2 ms");
  expect(latencyInterval([0, 9, 1], [1, 2], 0.99)).toBe(">2 ms");
  expect(latencyInterval([0, 0], [1], 0.5)).toBe("—");
});
