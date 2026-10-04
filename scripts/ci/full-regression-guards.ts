import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function fail(message: string): never {
  throw new Error(message);
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function assertContains(path: string, needle: string, message: string) {
  if (!read(path).includes(needle)) fail(message);
}

function assertNotContains(path: string, needle: string, message: string) {
  if (read(path).includes(needle)) fail(message);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sourceText = walk("src")
  .filter((path) => /\.(ts|tsx|js|jsx)$/.test(path))
  .map(read)
  .join("\n");

if (sourceText.includes("verified:")) fail("Client authority token marker reintroduced");
if (sourceText.includes("unrestrictedLegalMoves")) fail("Unrestricted legal-move placeholder reintroduced");

for (const route of ["src/routes/create.tsx", "src/routes/join.tsx", "src/routes/lobby.tsx", "src/routes/table.tsx"]) {
  const text = read(route);
  for (const forbidden of ["useDemoState", "demoStore", "mockRoomService", "useDemoTable"]) {
    if (text.includes(forbidden)) fail(`Demo authority marker ${forbidden} found in ${route}`);
  }
}

assertContains(
  "src/server/dealerBootstrap.ts",
  "secureServerEntropySeed",
  "Dealer bootstrap must keep private server-owned entropy",
);
assertContains(
  "src/domain/gameState.ts",
  "GAME_STATE_SCHEMA_VERSION",
  "Canonical state schema version marker missing",
);
assertNotContains(
  "src/domain/projection.ts",
  "...canonicalState",
  "Projection must not wholesale-copy canonical state",
);
assertNotContains(
  "supabase/functions/verify-player-pin/index.ts",
  "legacy-authenticate",
  "Legacy authentication compatibility must remain removed",
);

console.log("Critical architecture/security guards passed");
