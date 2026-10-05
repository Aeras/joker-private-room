import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("JK-006 automatic fullscreen landscape entry", () => {
  it("requests fullscreen before locking landscape and supports rollback", () => {
    const display = read("src/lib/gameDisplayMode.ts");
    expect(display).toContain("document.documentElement.requestFullscreen()");
    expect(display).toContain('orientation.lock("landscape")');
    expect(display).toContain("orientation.unlock?.()");
    expect(display).toContain("document.exitFullscreen()");
  });

  it("starts display mode directly from the host Start gesture", () => {
    const lobby = read("src/routes/lobby.tsx");
    expect(lobby).toContain("const displayMode = await enterGameDisplayMode()");
    expect(lobby.indexOf("enterGameDisplayMode()")) .toBeLessThan(lobby.indexOf("startProductionRoom({"));
    expect(lobby).toContain("if (!keepDisplayMode) await rollbackGameDisplayMode(displayMode)");
  });

  it("starts display mode directly from the participant Join gesture", () => {
    const join = read("src/routes/join.tsx");
    expect(join).toContain("const displayMode = await enterGameDisplayMode()");
    expect(join.indexOf("enterGameDisplayMode()")) .toBeLessThan(join.indexOf("realIdentityService.verifyPin"));
    expect(join).toContain("if (!keepDisplayMode) await rollbackGameDisplayMode(displayMode)");
  });

  it("suppresses the old portrait rotation blocker", () => {
    const styles = read("src/styles.css");
    expect(styles).toContain("Auto fullscreen/landscape replaces the old portrait rotation blocker");
    expect(styles).toContain(".joker-room>.absolute.inset-0.z-\\[100\\]{display:none!important}");
  });
});
