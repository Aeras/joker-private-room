import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const source=(file:string)=>readFileSync(resolve(process.cwd(),file),"utf8");
const edge=source("supabase/functions/durak-commands/index.ts");
const sql=source("supabase/migrations/20261011074500_durak_authoritative_game.sql");
const route=source("src/routes/durak.tsx");
describe("DURAK real multiplayer boundary",()=>{
 it("serves only each user's own cards, never the other players' hands",()=>{
   expect(edge).toContain("const ownCards=state.hands[seat]");
   expect(edge).toContain("handSizes:state.hands.map(h=>h.length)");
   expect(edge).toContain("myHand:ownCards");
   expect(edge).not.toContain("hands:state.hands");
 });
 it("authenticates game commands and compares versions atomically",()=>{
   expect(edge).toContain("sessionToken");
   expect(edge).toContain("legalDurakMoves(state,seat)");
   expect(edge).toContain('gameRpc("save",revision,state)');
   expect(sql).toContain("p_session_token");
   expect(sql).toContain("revision=p_expected_revision");
   expect(sql).toContain("for update");
 });
 it("denies browser read access to complete match state",()=>{
   expect(sql).toContain("durak_match_states enable row level security");
   expect(sql).toContain("from public, anon, authenticated");
   expect(sql).toContain("to service_role");
 });
 it("removes the embedded practice from actual entry",()=>{
   expect(route).not.toContain("DurakPractice");
   expect(route).toContain("DurakOnlineTable");
   expect(route).toContain("Έναρξη παρτίδας");
   expect(route).toContain("bot_add");
   expect(route).toContain("bot_remove");
 });
});
