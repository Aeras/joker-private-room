import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("JK-005 pregame visual identity", () => {
  it("uses the user-confirmed home asset mapping without flattening navigation into a screenshot", () => {
    const home = read("src/routes/index.tsx");

    expect(home).toContain('HOME_BACKGROUND = "/home/file_00000000ff708210a91f5598803905f3.png"');
    expect(home).toContain('CREATE_GAME_ART = "/home/file_0000000025f481f49e4f8c88502ea288.png"');
    expect(home).toContain('JOIN_GAME_ART = "/home/file_000000000c548243815079f73a1f05cb.png"');
    expect(home).toContain("function HomeArtButton");
    expect(home).toContain("<Link");
    expect(home).toContain("aria-label={label}");
    expect(home).toContain('to="/history"');
    expect(home).toContain('to="/settings"');
    expect(home).toContain("Επιστροφή στο παιχνίδι");
  });

  it("keeps a visible press response on the approved image CTAs", () => {
    const css = read("src/pregame.css");

    expect(css).toContain(".home-art-button:active");
    expect(css).toContain("translateY(3px) scale(0.975)");
    expect(css).toContain(".home-art-button:focus-visible");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("scopes the premium visual family to Create, Join and Lobby", () => {
    const shell = read("src/components/joker/ScreenShell.tsx");
    const create = read("src/routes/create.tsx");
    const join = read("src/routes/join.tsx");
    const lobby = read("src/routes/lobby.tsx");

    expect(shell).toContain('variant?: "default" | "pregame"');
    expect(shell).toContain('pregame && "pregame-shell"');
    expect(create).toContain('variant="pregame"');
    expect(join).toContain('variant="pregame"');
    expect(lobby).toContain('variant="pregame"');
    expect(create).toContain("pregame-primary-button");
    expect(join).toContain("pregame-primary-button");
    expect(lobby).toContain("pregame-primary-button");
  });
});
