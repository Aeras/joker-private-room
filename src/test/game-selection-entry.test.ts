import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
describe("separate game selection after secure player login", () => {
  it("shows game choice only after the existing PIN/session gate", () => {
    const home = read("src/routes/index.tsx");
    expect(home).toContain("<PlayerSessionGate");
    expect(home).toContain("Επιλέξτε το παιχνίδι");
    expect(home).toContain('href="/joker"');
    expect(home).toContain("DURAK");
    expect(home).toContain("Προσεχώς");
    expect(home).not.toContain('to="/create"');
  });
  it("keeps Joker's original create, join and return-to-game flow", () => {
    const joker = read("src/routes/joker.tsx");
    expect(joker).toContain('createFileRoute("/joker")');
    expect(joker).toContain('to="/create"');
    expect(joker).toContain('to="/join"');
    expect(joker).toContain('to="/table"');
    expect(joker).toContain("PlayerSessionGate");
    expect(read("src/components/table/TableUtilityMenu.tsx")).toContain('window.location.assign("/joker")');
  });
});
