import {describe,it,expect} from "vitest";
import {startBiribaClock,nextBiribaClock,pauseBiribaClock,resumeBiribaClock,timeoutBiribaClock,reclaimBiribaClock} from "./clock";
describe("Biriba server clock invariants",()=>{
 it("starts with sixty seconds and three personal pause opportunities",()=>{
  const c=startBiribaClock(4,1000);
  expect(c.turnDeadline).toBe(61000);expect(c.pausesUsed).toEqual([0,0,0,0]);
  expect(c.pausedBy).toBeNull();
 });
 it("pauses only on the human's current turn and resumes with exact remaining time",()=>{
  const c=startBiribaClock(4,0);
  expect(()=>pauseBiribaClock(c,2,1,true,15000)).toThrow("PAUSE_DENIED");
  expect(()=>pauseBiribaClock(c,0,0,false,15000)).toThrow("PAUSE_DENIED");
  const paused=pauseBiribaClock(c,0,0,true,15000);
  expect(paused.remainingMs).toBe(45000);
  expect(paused.pausesUsed[0]).toBe(1);
  expect(()=>resumeBiribaClock(paused,1,50000)).toThrow("NOT_PAUSE_OWNER");
  expect(resumeBiribaClock(paused,0,50000).turnDeadline).toBe(95000);
 });
 it("allows exactly three pauses per real player for entire match",()=>{
  let c=startBiribaClock(2,0);
  for(let i=0;i<3;i++){
   c=resumeBiribaClock(pauseBiribaClock(c,0,0,true,1000+i*10000),0,2000+i*10000);
  }
  expect(c.pausesUsed[0]).toBe(3);
  expect(()=>pauseBiribaClock(c,0,0,true,32000)).toThrow("PAUSE_DENIED");
  expect(pauseBiribaClock(c,1,1,true,32000).pausesUsed[1]).toBe(1);
 });
 it("never times out while paused",()=>{
  const p=pauseBiribaClock(startBiribaClock(2,0),0,0,true,5000);
  expect(timeoutBiribaClock(p,0,true,100000)).toEqual(p);
 });
 it("switches to bot at deadline and permits human reclaim",()=>{
  const timed=timeoutBiribaClock(startBiribaClock(2,0),0,true,60000);
  expect(timed.botTakeovers).toEqual([0]);
  const recovered=reclaimBiribaClock(timed,0,0,80000);
  expect(recovered.botTakeovers).toEqual([]);
  expect(recovered.turnDeadline).toBe(140000);
 });
 it("does not reset another player's clock when reclaiming outside own turn",()=>{
  const c={...nextBiribaClock(startBiribaClock(4,0),10000),botTakeovers:[1]};
  expect(reclaimBiribaClock(c,1,2,22000).turnDeadline).toBe(c.turnDeadline);
 });
});
