import {BIRIBA_PAUSES_PER_HUMAN,BIRIBA_TURN_SECONDS} from "./rules";
export type BiribaClock={
 turnDeadline:number;
 remainingMs:number;
 pausedBy:number|null;
 pausesUsed:number[];
 botTakeovers:number[];
};
export function startBiribaClock(players:number,now:number):BiribaClock{
 return {turnDeadline:now+BIRIBA_TURN_SECONDS*1000,remainingMs:BIRIBA_TURN_SECONDS*1000,
   pausedBy:null,pausesUsed:Array(players).fill(0),botTakeovers:[]};
}
export function nextBiribaClock(clock:BiribaClock,now:number):BiribaClock{
 return {...clock,turnDeadline:now+BIRIBA_TURN_SECONDS*1000,remainingMs:BIRIBA_TURN_SECONDS*1000};
}
export function pauseBiribaClock(clock:BiribaClock,seat:number,currentSeat:number,isHuman:boolean,now:number):BiribaClock{
 if(!isHuman||seat!==currentSeat||clock.pausedBy!==null||clock.botTakeovers.includes(seat)
   ||(clock.pausesUsed[seat]??BIRIBA_PAUSES_PER_HUMAN)>=BIRIBA_PAUSES_PER_HUMAN)
  throw new Error("PAUSE_DENIED");
 const used=[...clock.pausesUsed];used[seat]=(used[seat]??0)+1;
 return {...clock,pausesUsed:used,pausedBy:seat,remainingMs:Math.max(0,clock.turnDeadline-now)};
}
export function resumeBiribaClock(clock:BiribaClock,seat:number,now:number):BiribaClock{
 if(clock.pausedBy!==seat)throw new Error("NOT_PAUSE_OWNER");
 return {...clock,pausedBy:null,turnDeadline:now+clock.remainingMs};
}
export function timeoutBiribaClock(clock:BiribaClock,currentSeat:number,isHuman:boolean,now:number):BiribaClock{
 if(clock.pausedBy!==null||!isHuman||now<clock.turnDeadline||clock.botTakeovers.includes(currentSeat))return clock;
 return {...clock,botTakeovers:[...clock.botTakeovers,currentSeat]};
}
export function reclaimBiribaClock(clock:BiribaClock,seat:number,now:number):BiribaClock{
 if(!clock.botTakeovers.includes(seat)||clock.pausedBy!==null)throw new Error("RECLAIM_DENIED");
 return {...clock,botTakeovers:clock.botTakeovers.filter(s=>s!==seat),turnDeadline:now+BIRIBA_TURN_SECONDS*1000,remainingMs:BIRIBA_TURN_SECONDS*1000};
}
