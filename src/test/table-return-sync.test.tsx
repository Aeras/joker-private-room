import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import type { PlayerGameProjection } from "@/domain/projection";
import { hydrateReturnedPresentation } from "@/components/table/tableReturnSync";
import { dealPresentationStageKey, dealPresentationWasCompleted } from "@/components/table/dealPresentationModel";
const mocks = vi.hoisted(() => ({ room: vi.fn(), state: vi.fn(), submit: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({ code: "TEST", gameId: "00000000-0000-4000-8000-000000000201" }) }), Link: () => null }));
vi.mock("@/services/roomFunctions", () => ({ getProductionRoom: mocks.room }));
vi.mock("@/services/gameProjectionFunctions", () => ({ getProjectedGameState: mocks.state, getProjectedGameReadiness: vi.fn(), setProjectedGameReady: vi.fn(), startProjectedGame: vi.fn(), completeProjectedStartPresentation: vi.fn(), completeProjectedNineCardPresentation: vi.fn(), completeProjectedTurnPresentation: vi.fn(), submitProjectedGameplayCommand: mocks.submit, reclaimProjectedGameControl: vi.fn(), terminateProjectedGame: vi.fn() }));
vi.mock("@/services/dialogueFunctions", () => ({ getDialogueMessages: vi.fn(), listEmojiReactions: vi.fn().mockResolvedValue({ ok: true, reactions: [] }), sendEmojiReaction: vi.fn(), requestBotDialogueReply: vi.fn(), requestDialogueReaction: vi.fn(), sendHumanMessageToBot: vi.fn() }));
vi.mock("@/components/table/GameTable", () => ({ GameTable: ({ projection, onCommand }: { projection: PlayerGameProjection; onCommand: (command: {type:"declare";value:number}) => Promise<unknown> }) => <div data-testid="table">Version {projection.stateVersion}<button onClick={() => void onCommand({type:"declare",value:1})}>Test command</button>{projection.local.reclaimAvailable && <button>Πάρε ξανά τον έλεγχο</button>}</div> }));
vi.mock("@/components/table/LandscapeTableGuard", () => ({ LandscapeTableGuard: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/table/DialogueOverlay", () => ({ DialogueOverlay: () => null }));
vi.mock("@/components/table/TableMessaging", () => ({ TableMessaging: () => null }));
import { Route } from "@/routes/table";
const Component = Route.options.component as ComponentType;
function projection(version = 10) {
 const state = reconciliationFixture(); state.progression.phase = "CARD_PLAY"; state.progression.dealNumber = 3;
 state.seats[0].owner = { type: "human", playerId: "returning" }; state.seats[0].controller = "temporary_bot"; state.seats[0].reclaimable = true;
 const p = projectGameForSeat(state, 0); p.stateVersion = version; p.initialDealerSelection = null; return p;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
 vi.useFakeTimers(); vi.resetAllMocks();
 vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 16)); vi.stubGlobal("cancelAnimationFrame", window.clearTimeout);
 const p = projection(); mocks.room.mockResolvedValue({ ok: true, room: { code: "TEST", gameId: p.gameId, status: "playing", rulesetId: p.rulesetId, botSettings: { botsTalk: false }, seats: p.seats.map((s, index) => ({ index, occupant: { type: "human", player: { id: "returning", displayName: "Git" } } })) } });
 mocks.state.mockResolvedValue({ ok: true, projection: p });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
it("delivers a game update before slow room metadata and keeps the newer command on late metadata", async () => {
 const initial = projection(); initial.seats[0].controller = "human"; initial.progression.currentActorSeat = 0;
 mocks.state.mockResolvedValue({ok:true,projection:initial});
 render(<Component />); await flush();
 const roomResult = await mocks.room.mock.results[0]!.value;
 const slowRoom = deferred<unknown>(); mocks.room.mockReturnValueOnce(slowRoom.promise);
 const next = structuredClone(initial); next.stateVersion = 11;
 mocks.state.mockResolvedValue({ok:true,projection:next});
 await act(async () => { vi.advanceTimersByTime(1500); });
 expect(screen.getByTestId("table")).toHaveTextContent("Version 11");
 const command = structuredClone(next); command.stateVersion = 12;
 mocks.submit.mockResolvedValue({ok:true,projection:command});
 fireEvent.click(screen.getByRole("button", {name:"Test command"})); await flush();
 await act(async () => { slowRoom.resolve(roomResult); });
 expect(screen.getByTestId("table")).toHaveTextContent("Version 12");
});
it("queues one fresh bot read after an in-flight older poll instead of waiting for the interval", async () => {
 const initial = projection(); initial.seats[0].controller = "human"; initial.progression.currentActorSeat = 0;
 mocks.state.mockResolvedValue({ok:true,projection:initial});
 render(<Component />); await flush();
 const oldPoll = deferred<unknown>(); mocks.state.mockReturnValueOnce(oldPoll.promise);
 await act(async () => { vi.advanceTimersByTime(1500); });
 const command = structuredClone(initial); command.stateVersion = 12; command.seats[0].controller = "temporary_bot";
 const next = structuredClone(initial); next.stateVersion = 13;
 mocks.state.mockResolvedValue({ok:true,projection:next});
 mocks.submit.mockResolvedValue({ok:true,projection:command});
 fireEvent.click(screen.getByRole("button", {name:"Test command"})); await flush();
 expect(mocks.state).toHaveBeenCalledTimes(2);
 await act(async () => { oldPoll.resolve({ok:true,projection:initial}); }); await flush();
 expect(mocks.state).toHaveBeenCalledTimes(3);
 expect(screen.getByTestId("table")).toHaveTextContent("Version 13");
});
it("does not bypass fresh room validation on reconnect", async () => {
 const initial = projection(); initial.seats[0].controller = "human"; initial.progression.currentActorSeat = 0;
 mocks.state.mockResolvedValue({ok:true,projection:initial});
 render(<Component />); await flush();
 const roomResult = await mocks.room.mock.results[0]!.value;
 const slowRoom = deferred<unknown>(); mocks.room.mockReturnValueOnce(slowRoom.promise);
 mocks.state.mockResolvedValue({ok:true,projection:projection(60)});
 fireEvent.blur(window); fireEvent.focus(window); await flush();
 expect(screen.queryByTestId("table")).toBeNull();
 await act(async () => { slowRoom.resolve(roomResult); });
 expect(screen.getByTestId("table")).toHaveTextContent("Version 60");
});
it("coalesces slow metadata reads while fresh game polls continue", async () => {
 const initial = projection(); initial.seats[0].controller = "human"; initial.progression.currentActorSeat = 0;
 mocks.state.mockResolvedValue({ok:true,projection:initial});
 render(<Component />); await flush();
 const roomResult = await mocks.room.mock.results[0]!.value;
 const slowRoom = deferred<unknown>(); mocks.room.mockReturnValueOnce(slowRoom.promise);
 for (const version of [11, 12]) {
   const next = structuredClone(initial); next.stateVersion = version;
   mocks.state.mockResolvedValue({ok:true,projection:next});
   await act(async () => { vi.advanceTimersByTime(1500); });
   expect(screen.getByTestId("table")).toHaveTextContent(`Version ${version}`);
 }
 expect(mocks.room).toHaveBeenCalledTimes(2);
 await act(async () => { slowRoom.resolve(roomResult); });
 expect(screen.getByTestId("table")).toHaveTextContent("Version 12");
});
it("shows only a fresh table on return and discards a poll started before absence", async () => {
 render(<Component />); await flush(); expect(screen.getByTestId("table")).toHaveTextContent("Version 10");
 const oldPoll = deferred<unknown>(); mocks.state.mockReturnValueOnce(oldPoll.promise);
 await act(async () => { vi.advanceTimersByTime(1500); });
 const fresh = deferred<unknown>(); mocks.state.mockReturnValueOnce(fresh.promise);
 fireEvent.blur(window); fireEvent.focus(window);
 expect(screen.queryByTestId("table")).toBeNull();
 await act(async () => { oldPoll.resolve({ ok: true, projection: projection(11) }); });
 expect(screen.queryByTestId("table")).toBeNull();
 await act(async () => { fresh.resolve({ ok: true, projection: projection(20) }); });
 expect(screen.getByTestId("table")).toHaveTextContent("Version 20");
 expect(screen.getByRole("button", { name: "Πάρε ξανά τον έλεγχο" })).toBeEnabled();
});
it("recovers a stale read without showing the red gameplay rejection message", async () => {
 mocks.state.mockResolvedValueOnce({ ok: false, code: "STALE_STATE" }).mockResolvedValueOnce({ ok: true, projection: projection(30) });
 render(<Component />); await flush();
 expect(screen.getByTestId("table")).toHaveTextContent("Version 30");
 expect(screen.queryByText(/Η παρτίδα προχώρησε/)).toBeNull();
});
it("keeps the stale table hidden through repeated read collisions until a fresh poll succeeds", async () => {
 render(<Component />); await flush();
 mocks.state.mockResolvedValueOnce({ ok: false, code: "STALE_STATE" }).mockResolvedValueOnce({ ok: false, code: "STALE_STATE" });
 fireEvent.blur(window); fireEvent.focus(window); await flush();
 expect(screen.queryByTestId("table")).toBeNull(); expect(screen.queryByText(/Η παρτίδα προχώρησε/)).toBeNull();
 mocks.state.mockResolvedValue({ ok: true, projection: projection(40) });
 await act(async () => { vi.advanceTimersByTime(1500); });
 expect(screen.getByTestId("table")).toHaveTextContent("Version 40");
});
it.each(["DEAL_PRESENTATION", "NINE_CARD_INITIAL_DEAL_ALL_SEATS", "NINE_CARD_REMAINING_DEAL"] as const)("does not mark the current %s barrier completed on return", phase => {
 const p = projection(); p.gameId = phase; p.progression.phase = phase;
 hydrateReturnedPresentation(p);
 const stage = phase === "DEAL_PRESENTATION" ? "full" : phase === "NINE_CARD_INITIAL_DEAL_ALL_SEATS" ? "initial" : "remaining";
 expect(dealPresentationWasCompleted(dealPresentationStageKey(p.gameId, p.progression.dealNumber, p.progression.dealerSeat, stage))).toBe(false);
});
it("marks only the already completed initial stage at trump choice and skips past dealing at card play", () => {
 const p = projection(); p.gameId = "return-trump"; p.progression.phase = "NINE_CARD_TRUMP_CHOICE";
 hydrateReturnedPresentation(p);
 const key = (stage: "initial" | "remaining" | "full") => dealPresentationStageKey(p.gameId, p.progression.dealNumber, p.progression.dealerSeat, stage);
 expect(dealPresentationWasCompleted(key("initial"))).toBe(true); expect(dealPresentationWasCompleted(key("remaining"))).toBe(false);
 p.progression.phase = "CARD_PLAY"; hydrateReturnedPresentation(p);
 expect(dealPresentationWasCompleted(key("remaining"))).toBe(true); expect(dealPresentationWasCompleted(key("full"))).toBe(true);
});

it("ignores an old command rejection after returning to a newer table", async () => {
 const command = deferred<unknown>(); mocks.submit.mockReturnValue(command.promise);
 render(<Component />); await flush();
 fireEvent.click(screen.getByRole("button", {name:"Test command"}));
 mocks.state.mockResolvedValue({ok:true,projection:projection(50)});
 fireEvent.blur(window); fireEvent.focus(window); await flush();
 expect(screen.getByTestId("table")).toHaveTextContent("Version 50");
 await act(async () => { command.resolve({ok:false,code:"STALE_STATE"}); });
 expect(screen.getByTestId("table")).toHaveTextContent("Version 50"); expect(screen.queryByText(/Η παρτίδα προχώρησε/)).toBeNull();
});
it("hides the old table until a hidden-to-visible return fetch completes", async () => {
 render(<Component />); await flush();
 const fresh = deferred<unknown>(); mocks.state.mockReturnValueOnce(fresh.promise);
 const visibility = vi.spyOn(document, "visibilityState", "get"); visibility.mockReturnValue("hidden"); fireEvent(document, new Event("visibilitychange"));
 visibility.mockReturnValue("visible"); fireEvent(document, new Event("visibilitychange"));
 expect(screen.queryByTestId("table")).toBeNull();
 await act(async () => { fresh.resolve({ok:true,projection:projection(60)}); });
 expect(screen.getByTestId("table")).toHaveTextContent("Version 60"); visibility.mockRestore();
});
