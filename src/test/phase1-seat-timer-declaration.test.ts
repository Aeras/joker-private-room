import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projection = readFileSync("src/domain/projection.ts", "utf8");
const tableSeat = readFileSync("src/components/table/TableSeat.tsx", "utf8");
const gameTable = readFileSync("src/components/table/GameTable.tsx", "utf8");
const declaration = readFileSync("src/components/table/DeclarationPicker.tsx", "utf8");

describe("JK-001 Phase 1 — seat, timer and declaration contract", () => {
  it("projects the authoritative human deadline publicly without moving timeout authority client-side", () => {
    expect(projection).toContain("currentHumanDeadline: state.timing.currentHumanDeadline");
    expect(projection).toContain("state.progression.currentActorSeat === seat ? state.timing.currentHumanDeadline : null");
    expect(tableSeat).not.toMatch(/onCommand|system_timeout|timeout_takeover/);
  });

  it("moves the primary countdown from the header to the active avatar ring", () => {
    expect(gameTable).not.toContain('import { TurnTimer } from "./TurnTimer"');
    expect(gameTable).not.toContain("<TurnTimer");
    expect(gameTable).toContain("humanDeadline: projection.progression.currentActorSeat === seat ? publicDeadline : null");
    expect(tableSeat).toContain("HUMAN_TURN_MS = 30_000");
    expect(tableSeat).toContain("conic-gradient(var(--gold)");
    expect(tableSeat).toContain("Ενεργός παίκτης");
  });

  it("shows authoritative actual/declared progress and keeps non-color semantics", () => {
    expect(gameTable).toContain("tricksTaken: projection.score.tricksTaken[seat]");
    expect(gameTable).toContain("declaration: projection.declarations.values[seat]");
    expect(tableSeat).toContain("`${tricksTaken} / —`");
    expect(tableSeat).toContain('marker: "✓"');
    expect(tableSeat).toContain('marker: "!"');
    expect(tableSeat).toContain("Μπάζες / Δήλωση");
  });

  it("keeps the local identity as a real avatar and marks it as self", () => {
    expect(tableSeat).toContain("<PlayerAvatar");
    expect(tableSeat).toContain("· ΕΣΥ");
    expect(gameTable).toContain("left-[max(.65rem,env(safe-area-inset-left))]");
  });

  it("renders the complete declaration range while disabling values outside projected legality", () => {
    expect(gameTable).toContain("Array.from({ length: projection.progression.cardsPerPlayer + 1 }");
    expect(gameTable).toContain("legalValues={declarationAction.values}");
    expect(declaration).toContain("const allowed = legalValues.includes(value)");
    expect(declaration).toContain("disabled={busy || !allowed}");
    expect(declaration).toContain("Μη επιτρεπτή δήλωση για τον dealer");
    expect(declaration).toContain('value === 0 ? "—"');
    expect(declaration).not.toContain("<select");
  });
});
