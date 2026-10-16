import { afterEach, describe, expect, it, vi } from "vitest";
import { retryTimedOutRead } from "../../supabase/functions/biriba-commands/readOnlyRetry";

afterEach(() => vi.useRealTimers());

describe("Biriba authorized-state read retry", () => {
  it("aborts one stalled read and returns the second authorized result", async () => {
    vi.useFakeTimers();
    let count = 0;
    type Result = { data: { revision: number } | null; error: Error | null };
    const read = vi.fn((signal: AbortSignal): Promise<Result> => {
      count++;
      if (count === 2) return Promise.resolve({ data: { revision: 8 }, error: null });
      return new Promise<{ data: null; error: Error }>((resolve) =>
        signal.addEventListener("abort", () => resolve({ data: null, error: new Error("aborted") }), { once: true }),
      );
    });
    const pending = retryTimedOutRead(read, 20);
    await vi.advanceTimersByTimeAsync(20);
    expect(await pending).toEqual({ result: { data: { revision: 8 }, error: null }, attempts: 2 });
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0]![0].aborted).toBe(true);
  });

  it("does not retry ordinary authorization or database errors", async () => {
    const read = vi.fn(async () => ({ data: null, error: new Error("NOT_A_MEMBER") }));
    expect(await retryTimedOutRead(read, 20)).toMatchObject({ attempts: 1 });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("stops after one retry if both reads time out", async () => {
    vi.useFakeTimers();
    const read = vi.fn((signal: AbortSignal) =>
      new Promise<{ data: null; error: Error }>((resolve) =>
        signal.addEventListener("abort", () => resolve({ data: null, error: new Error("aborted") }), { once: true }),
      ),
    );
    const pending = retryTimedOutRead(read, 20);
    await vi.advanceTimersByTimeAsync(40);
    expect((await pending).attempts).toBe(2);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
