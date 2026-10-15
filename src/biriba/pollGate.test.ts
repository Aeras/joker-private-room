import { describe, expect, it, vi } from "vitest";
import { createBiribaPollGate } from "./pollGate";

describe("Biriba projection polling", () => {
  it("does not accumulate overlapping requests while one is slow", async () => {
    const gate = createBiribaPollGate();
    let release!: () => void;
    const work = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const first = gate.run(work);
    expect(await gate.run(work)).toBe(false);
    expect(await gate.run(work)).toBe(false);
    expect(work).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toBe(true);
    const next = gate.run(async count => { expect(count).toBe(1); });
    expect(await next).toBe(true);
    gate.stop();
    expect(await gate.run(work)).toBe(false);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("releases its slot when a refresh fails", async () => {
    const gate = createBiribaPollGate();
    await expect(gate.run(async () => { throw new Error("network"); })).rejects.toThrow("network");
    expect(await gate.run(async count => { expect(count).toBe(1); })).toBe(true);
  });
});
