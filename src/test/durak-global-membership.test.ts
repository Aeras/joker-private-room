import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read=(name:string)=>readFileSync(resolve(process.cwd(),"supabase/migrations",name),"utf8");
describe("one active room or match across all games",()=>{
  it("shares the exact player-scoped advisory namespace",()=>{
    const commands=read("20261011012500_durak_room_commands.sql");
    const guards=read("20261011013000_global_one_game_guard.sql");
    expect(commands).toContain("hashtextextended(v_player::text, 20261009)");
    expect(guards).toContain("hashtextextended(new.player_id::text, 20261009)");
  });
  it("blocks DURAK join/create for any JOKER running game",()=>{
    const commands=read("20261011012500_durak_room_commands.sql");
    expect(commands).toContain("public.game_participants");
    expect(commands).toContain("gp.status='active'");
  });
  it("enforces both directions at the database boundary",()=>{
    const guards=read("20261011013000_global_one_game_guard.sql");
    expect(guards).toContain("private.ensure_single_open_room_internal()");
    expect(guards).toContain("private.durak_enforce_global_one_game()");
    expect(guards).toContain("public.room_seats");
    expect(guards).toContain("public.durak_room_seats");
    expect(guards).toContain("public.game_participants");
    expect(guards).toContain("create trigger durak_global_one_game");
  });
});
