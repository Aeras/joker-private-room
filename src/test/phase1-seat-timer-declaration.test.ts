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

  it("renders the authoritative 30s countdown only when card interaction is actually ready", () => {
    expect(gameTable).not.toContain('import { TurnTimer } from "./TurnTimer"');
    expect(gameTable).not.toContain("<TurnTimer");
    expect(gameTable).toContain("const startupPresentationActive = dealerIntroActive || dealPresentationActive");
    expect(gameTable).toContain('const countdownPhase = projection.progression.phase === "CARD_PLAY" || projection.progression.phase === "JOKER_DECISION"');
    expect(gameTable).toContain("const isActor = !interactionPresentationActive && projection.progression.currentActorSeat === seat");
    expect(gameTable).toContain("humanDeadline: isActor && countdownPhase ? publicDeadline : null");
    expect(tableSeat).toContain("HUMAN_TURN_MS = 30_000");
    expect(tableSeat).toContain("conic-gradient(from 0deg");
    expect(tableSeat).toContain('return "#22c55e"');
    expect(tableSeat).toContain('return "#f59e0b"');
    expect(tableSeat).toContain('return "#ef4444"');
    expect(tableSeat).toContain('showCountdown ? "p-[4px]" : "p-[3px]"');
    expect(tableSeat).toContain("Ενεργός παίκτης");
  });

  it("dims only the avatar while a human seat is controlled by a temporary bot", () => {
    expect(gameTable).toContain('projection.seats[seat].controller === "temporary_bot"');
    expect(gameTable).toContain("isTemporarilyControlled:");
    expect(tableSeat).toContain("stats.isTemporarilyControlled");
    expect(tableSeat).toContain("brightness-50 opacity-65");
  });

  it("shows authoritative actual/declared progress after startup while keeping declarations hidden during dealing", () => {
    expect(gameTable).toContain("tricksTaken: projection.score.tricksTaken[seat]");
    expect(gameTable).toContain("declaration: startupPresentationActive ? null : pos === 0 ? pendingDeclarationValue ?? projection.declarations.values[seat] : projection.declarations.values[seat]");
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

  it("renders Pass through 9 in one compact panel while disabling values outside projected legality", () => {
    expect(gameTable).toContain("Array.from({ length: 10 }, (_, value) => value)");
    expect(gameTable).toContain("legalValues={declarationAction.values}");
    expect(declaration).toContain("const legal = new Set(legalValues)");
    expect(declaration).toContain("const allowed = legal.has(value)");
    expect(declaration).toContain("disabled={disabled}");
    expect(declaration).toContain("Δεν είναι διαθέσιμη σε αυτή τη μοιρασιά.");
    expect(declaration).toContain('value === 0 ? "Πάσο" : value');
    expect(declaration).toContain("grid grid-cols-5");
    expect(declaration).not.toContain("<select");
  });
});