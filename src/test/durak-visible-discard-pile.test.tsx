import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DurakDiscardPile } from "@/durak/DurakDiscardPile";
import { discardLanding } from "@/durak/discardGeometry";
vi.mock("@/components/joker/PlayingCard", () => ({ PlayingCard: () => <span data-back /> }));
afterEach(cleanup);
describe("DURAK persistent heap", () => {
  it("starts empty, grows through 4/10/12 and caps artwork without losing the count", () => {
    const { container, rerender } = render(<DurakDiscardPile count={0} />);
    for (const count of [0, 4, 10, 12, 36]) {
      rerender(<DurakDiscardPile count={count} />);
      expect(screen.getByLabelText(`Απορριμμένα φύλλα: ${count}`)).toBeInTheDocument();
      expect(container.querySelectorAll("[data-discard-index]")).toHaveLength(Math.min(count, 20));
      expect(container.querySelectorAll("[data-back]")).toHaveLength(Math.min(count, 20));
    }
  });
  it("uses bounded irregular landing positions consistently", () => {
    const rotations = new Set<number>();
    for (let i = 0; i < 36; i++) {
      const p = discardLanding(i);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(20);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(13);
      expect(Math.abs(p.angle)).toBeLessThanOrEqual(38);
      rotations.add(p.angle);
    }
    expect(rotations.size).toBeGreaterThan(20);
    const points = Array.from({ length: 12 }, (_, i) => discardLanding(i));
    expect(
      Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
    ).toBeGreaterThan(25);
    expect(
      Math.max(...points.map((p) => p.angle)) - Math.min(...points.map((p) => p.angle)),
    ).toBeGreaterThan(50);
    const offsets = points.slice(1).map((p, i) => p.x - points[i]!.x);
    expect(new Set(offsets).size).toBeGreaterThan(6);
    // New bouts do not relocate cards already in the mound.
    expect(discardLanding(3)).toEqual(points[3]);
  });
});
