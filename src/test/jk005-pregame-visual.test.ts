import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("landscape pregame application shell", () => {
  it("draws the Home UI in HTML/CSS instead of loading the old home artwork", () => {
    const home = read("src/routes/index.tsx");
    expect(home).toContain("home-landscape");
    expect(home).toContain("home-choice-card");
    expect(home).toContain("<FullscreenButton");
    expect(home).not.toContain("HOME_BACKGROUND");
    expect(home).not.toContain("CREATE_GAME_ART");
    expect(home).not.toContain("JOIN_GAME_ART");
    expect(home).toContain("Επιστροφή στο παιχνίδι");
  });

  it("keeps Create, Join and Lobby in one landscape-first shell with fullscreen access", () => {
    const shell = read("src/components/joker/ScreenShell.tsx");
    const create = read("src/routes/create.tsx");
    const join = read("src/routes/join.tsx");
    const lobby = read("src/routes/lobby.tsx");
    const css = read("src/pregame.css");

    expect(shell).toContain('variant?: "default" | "pregame"');
    expect(shell).toContain("<FullscreenButton");
    expect(shell).toContain("pregame-portrait-gate");
    expect(create).toContain("pregame-create-grid");
    expect(join).toContain("Διαθέσιμα παιχνίδια");
    expect(lobby).toContain("pregame-lobby-grid");
    expect(css).toContain("height: 100dvh");
    expect(css).toContain("overflow: hidden");
    expect(css).toContain("@media (orientation: portrait)");
  });

  it("keeps Create auth and setup compact and aligned in landscape", () => {
    const create = read("src/routes/create.tsx");
    const css = read("src/pregame.css");

    expect(create).toContain("pregame-auth-control");
    expect(create).toContain("pregame-host-control");
    expect(create).toContain("pregame-pin-input");
    expect(create).toContain("pregame-rule-card");
    expect(create).toContain("pregame-bot-panel");
    expect(create).toContain("pregame-create-cta");
    expect(css).toContain(".pregame-auth-control");
    expect(css).toContain(".pregame-rule-card");
    expect(css).toContain(".pregame-create-footer");
    expect(css).toContain("@media (orientation: landscape) and (max-height: 520px)");
  });

  it("exposes host bot selection from lobby seats without replacing the table UI", () => {
    const lobby = read("src/routes/lobby.tsx");
    const roomFunctions = read("src/services/roomFunctions.ts");
    expect(lobby).toContain("assignProductionBot");
    expect(lobby).toContain("replaceProductionBot");
    expect(lobby).toContain("clearProductionBot");
    expect(lobby).toContain("Επιλογή bot");
    expect(roomFunctions).toContain("botId: data.botId");
  });
});
