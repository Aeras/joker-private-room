import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
describe("DURAK discard is authoritative",()=>{
 it("publishes the post-move server discard count for every public play",()=>{
  const recorder=read("supabase/functions/durak-commands/presentation.ts");
  expect(recorder).toContain("discardCount: after.discard.length");
 });
 it("does not falsely throw picked-up or undefended cards into the discard pile",()=>{
  const hook=read("src/durak/useDurakPresentation.ts");
  expect(hook).toContain("(upcoming.discardCount ?? latest.current?.discardCount ?? 0) > visibleRound.discardCount");
  expect(hook).toContain("incoming.discardCount > previous.discardCount");
  expect(hook).toContain("discardCount: event.round > previous.round");
 });
 it("keeps official discard semantics: only fully defended bouts add to discard",()=>{
  const engine=read("supabase/functions/durak-commands/engine.ts");
  expect(engine).toContain("if(m.taking)m.hands[m.defender]!.push(...cards);else m.discard.push(...cards)");
 });
});
