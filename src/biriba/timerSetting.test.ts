import {describe,it,expect} from "vitest";
import {beginBiribaMatch} from "./engine";
import {nextBiribaRound} from "./rounds";
describe("Biriba optional timer room setting",()=>{
 it("defaults to ON for existing/default rooms",()=>{expect(beginBiribaMatch(2,()=>0.25).timerEnabled).toBe(true)});
 it("persists OFF from the original room throughout all subsequent deals",()=>{
  const initial={...beginBiribaMatch(4,()=>0.25),timerEnabled:false,roundScored:true};
  const next=nextBiribaRound(initial,()=>0.32);
  expect(next.timerEnabled).toBe(false);
  expect(next.roundNumber).toBe(2);
  expect(next.clock.pausesUsed).toEqual([0,0,0,0]);
 });
});
