import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { cardFlightPose } from "@/components/table/cardFlightMotion";
import { compactRoundProgress, publicRemainingCardCount } from "@/components/table/tableDisplayModel";
import { TableSeat, SeatSummary } from "@/components/table/TableSeat";
import { DraggableHandCard } from "@/components/table/DraggableHandCard";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import { projectGameForSeat } from "@/domain/projection";
import type { Seat } from "@/domain/players";
afterEach(cleanup);

it("derives all round boundaries from canonical deal metadata", () => {
  expect([1,8,9,12,13,20,21,24].map(compactRoundProgress)).toEqual([
    "Γύρος 1 · 1/8", "Γύρος 1 · 8/8", "Γύρος 2 · 1/4", "Γύρος 2 · 4/4",
    "Γύρος 3 · 1/8", "Γύρος 3 · 8/8", "Γύρος 4 · 1/4", "Γύρος 4 · 4/4",
  ]);
});

it.each([0,90,180,270])("curves a flight but keeps both endpoints and orientation exact (%s)", angle => {
  const start = {x:100,y:200}, end = {x:300,y:100};
  expect(cardFlightPose(start,end,angle-6,angle,0)).toEqual({point:start,rotation:angle-6});
  const final = cardFlightPose(start,end,angle-6,angle,1);
  expect(final.point).toEqual(end); expect(final.rotation).toBeCloseTo(angle);
  expect(cardFlightPose(start,end,angle-6,angle,.5).point).not.toEqual({x:200,y:150});
});

it("renders only public card backs and declaration/taken values", () => {
  const seat = {index:1,occupant:{type:"bot",bot:{id:"bot",displayName:"Αντίπαλος"}}} as Seat;
  const view = render(<TableSeat seat={seat} orientation="vertical" visualSeat={1} stats={{totalScore:120,declaration:3,tricksTaken:2,isActive:false,isDealer:false,cardCount:7}} />);
  expect(view.getByLabelText("7 κλειστά φύλλα").children).toHaveLength(7);
  expect(view.getByTitle("Δήλωση / Μπάζες")).toHaveTextContent("3 / 2");
  expect(view.getByTitle("Συνολικό σκορ")).toHaveTextContent("120");
  expect(view.container.querySelector("[data-seat-info-layout]")).not.toHaveClass("bg-black/85");
});

it("does not invent nine-card holdings before the remainder is dealt", () => {
  const projection = projectGameForSeat(reconciliationFixture(),0);
  projection.progression.cardsPerPlayer = 9;
  projection.progression.phase = "NINE_CARD_TRUMP_CHOICE";
  projection.cards.currentTrick=[];projection.cards.completedTricks=[];
  expect(publicRemainingCardCount(projection,1)).toBe(3);
  projection.progression.phase="CARD_PLAY";
  expect(publicRemainingCardCount(projection,1)).toBe(9);
});

it("shades only forbidden cards and still rejects their interaction", () => {
  const commit=vi.fn();
  const props={card:{kind:"standard" as const,id:"A-hearts",rank:"A" as const,suit:"hearts" as const},legal:false,blocked:false,pending:false,authorityKey:"1",zIndex:0,overlap:false,onCommit:commit};
  const view=render(<DraggableHandCard {...props} />);
  expect(view.getByRole("button")).toHaveAttribute("data-hand-illegal","true");
  fireEvent.keyDown(view.getByRole("button"),{key:"Enter"});expect(commit).not.toHaveBeenCalled();
  view.rerender(<DraggableHandCard {...props} legal />);
  expect(view.getByRole("button")).toHaveAttribute("data-hand-illegal","false");
});

it("keeps side-hand space between avatar and compact summary", () => {
  const seat = {index:1,occupant:{type:"bot",bot:{id:"bot",displayName:"Αντίπαλος"}}} as Seat;
  const stats = {totalScore:120,declaration:3,tricksTaken:2,isActive:false,isDealer:false,cardCount:9};
  const view = render(<TableSeat seat={seat} orientation="vertical" visualSeat={1} stats={stats} />);
  const spacer=view.container.querySelector(".joker-remote-hand-space")!;
  const summary=view.container.querySelector(".joker-seat-info")!;
  expect(spacer.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(view.getByLabelText("9 κλειστά φύλλα").children).toHaveLength(9);
  view.rerender(<><TableSeat seat={seat} orientation="horizontal" local stats={stats}/><div data-local-hand-summary><SeatSummary seat={seat} stats={stats} local/></div></>);
  expect(view.container.querySelector(".joker-seat-identity .joker-seat-info")).toBeNull();
  expect(view.container.querySelector("[data-local-hand-summary]")).toHaveTextContent("Αντίπαλος · ΕΣΥ1203 / 2");
});
