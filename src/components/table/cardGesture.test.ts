import { describe, expect, it } from "vitest";
import {
  pointInsideCardDropRect,
  shouldCommitCardGesture,
  shouldCommitCardRelease,
} from "./cardGesture";

describe("JK-001 Phase 1 card gesture intent", () => {
  it("commits a legal-looking slow upward drag past the distance threshold", () => {
    expect(shouldCommitCardGesture({ deltaX: 8, deltaY: -70, durationMs: 500 })).toBe(true);
  });

  it("does not commit a short drag", () => {
    expect(shouldCommitCardGesture({ deltaX: 3, deltaY: -18, durationMs: 220 })).toBe(false);
  });

  it("commits a short fast upward flick", () => {
    expect(shouldCommitCardGesture({ deltaX: 4, deltaY: -32, durationMs: 35 })).toBe(true);
  });

  it("rejects sideways flicks", () => {
    expect(shouldCommitCardGesture({ deltaX: 110, deltaY: -35, durationMs: 35 })).toBe(false);
  });

  it("rejects downward releases", () => {
    expect(shouldCommitCardGesture({ deltaX: 0, deltaY: 80, durationMs: 100 })).toBe(false);
  });
});

describe("desktop card drag/drop", () => {
  const felt = { left: 100, top: 80, right: 900, bottom: 520 };

  it("recognizes points inside the visible felt", () => {
    expect(pointInsideCardDropRect(450, 300, felt)).toBe(true);
    expect(pointInsideCardDropRect(950, 300, felt)).toBe(false);
  });

  it("commits a mouse release over the felt even without a large upward gesture", () => {
    expect(shouldCommitCardRelease({
      pointerType: "mouse",
      clientX: 450,
      clientY: 420,
      dropRect: felt,
      gesture: { deltaX: 20, deltaY: -12, durationMs: 900 },
    })).toBe(true);
  });

  it("does not commit a mouse release outside the felt unless the normal gesture qualifies", () => {
    expect(shouldCommitCardRelease({
      pointerType: "mouse",
      clientX: 950,
      clientY: 600,
      dropRect: felt,
      gesture: { deltaX: 10, deltaY: -12, durationMs: 900 },
    })).toBe(false);
  });

  it("keeps touch behavior on the established gesture classifier", () => {
    expect(shouldCommitCardRelease({
      pointerType: "touch",
      clientX: 450,
      clientY: 300,
      dropRect: felt,
      gesture: { deltaX: 4, deltaY: -18, durationMs: 250 },
    })).toBe(false);
  });
});
