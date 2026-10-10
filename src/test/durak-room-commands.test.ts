import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql=readFileSync(resolve(process.cwd(),"supabase/migrations/20261011012500_durak_room_commands.sql"),"utf8");
describe("DURAK session-validated room transactions",()=>{
  it("resolves identity on server without trusting player id from request",()=>{
    expect(sql).toContain("validate_player_session_internal(p_session_token)");
    expect(sql).toContain("'NOT_AUTHENTICATED'");
    expect(sql).not.toContain("p_player_id");
  });
  it("keeps creation and joining server-authoritative",()=>{
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("for update");
    expect(sql).toContain("public.durak_room_seats");
    expect(sql).toContain("public.game_participants");
  });
  it("requires membership before reading nonpublic lobby details",()=>{
    expect(sql).toContain("p_action='get'");
    expect(sql).toContain("'NOT_A_MEMBER'");
  });
  it("blocks direct anonymous RPC execution",()=>{
    expect(sql).toContain("revoke all on function public.durak_room_command_internal");
    expect(sql).toContain("to service_role");
  });
});
