import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const staticCanvas = readFileSync("src/components/table/canvas/CanvasStaticCards.tsx", "utf8");
const seat = readFileSync("src/components/table/TableSeat.tsx", "utf8");
const trump = readFileSync("src/components/table/TrumpIndicator.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

describe("static card Canvas ownership", () => {
  it("retains back artwork for settled opponents and remains backs-only", () => {
    expect(seat).toContain('<CanvasStaticCards kind="remote"');
    expect(seat).toContain('data-static-card-item=""');
    expect(staticCanvas).toContain("draw(back, i * w * 0.1, 0)");
    expect(staticCanvas).toContain("const offset = i * w * 0.1");
    expect(staticCanvas).not.toContain("ownHand");
  });
  it("retains exposed trump after the flight without altering suit announcements", () => {
    expect(trump).toContain('<CanvasStaticCards kind="trump"');
    expect(staticCanvas).toContain("draw(face ?? back, 0, 0)");
    expect(trump).toContain('data-trump-indicator="no-trump"');
  });
  it("paints before hiding DOM and falls back after context loss", () => {
    expect(staticCanvas).toContain("setPainted(true)");
    expect(staticCanvas).toContain("opacity: painted ? 0 : 1");
    expect(staticCanvas).toContain("opacity: painted ? 1 : 0");
    expect(staticCanvas).toContain('canvas.addEventListener("contextlost", lost)');
    expect(staticCanvas).toContain("const observer = new ResizeObserver(redraw)");
    expect(staticCanvas).not.toContain("requestAnimationFrame");
  });
  it("keeps remote seat DOM geometry aligned for both side orientations", () => {
    expect(styles).toContain('.joker-remote-hand [data-static-card-item]');
    expect(seat).toContain("visualSeat === 1 ? 90 : -90");
  });
});
