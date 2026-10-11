import { describe, expect, it } from "vitest";
import { applyDurakMove, beginDurak, legalDurakMoves } from "@/durak/engine";
import { chooseDurakBotMove } from "@/durak/bot";
describe("DURAK full-game bot smoke test",()=>{
  it.each(["podkidnoy","perevodnoy"] as const)("plays a complete two-player %s match",variant=>{
    let state=beginDurak(variant,2,()=>0.31);
    for(let step=0;step<2500&&!state.ended;step++){
      const seat=[0,1].find(i=>legalDurakMoves(state,i).length>0);
      if(seat===undefined)throw Error("DURAK_DEADLOCK at round "+state.round);
      const move=chooseDurakBotMove(state,seat,"balanced");
      if(!move)throw Error("NO_BOT_MOVE");
      state=applyDurakMove(state,seat,move);
    }
    expect(state.ended).toBe(true);
    expect(state.deck).toHaveLength(0);
  });
  it.each([3,4,5,6])("simulates %i-player bot table with valid moves",players=>{
    let state=beginDurak("podkidnoy",players,()=>0.27);
    for(let step=0;step<3000&&!state.ended;step++){
      const seat=state.hands.findIndex((_,i)=>legalDurakMoves(state,i).length>0);
      if(seat<0)throw Error("DEADLOCK at round "+state.round);
      const move=chooseDurakBotMove(state,seat,"balanced");
      if(!move)throw Error("BOT_NO_MOVE");
      state=applyDurakMove(state,seat,move);
    }
    expect(state.ended).toBe(true);
  });
});
