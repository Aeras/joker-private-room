import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const migration = "supabase/migrations/20261009235000_session_lobby_discovery_and_exit.sql";

describe("Session-first waiting room protection", () => {
  it("keeps room list and participant lookup authenticated and private", () => {
    const sql = read(migration);
    for (const rpc of [
      "list_waiting_rooms_internal(text)",
      "get_current_room_membership_internal(text)",
      "leave_waiting_room_internal(text,text)",
    ]) {
      expect(sql).toContain("revoke all on function public." + rpc);
      expect(sql).toContain("grant execute on function public." + rpc + " to service_role");
    }
    expect(sql).toContain("validate_player_session_internal(p_session_token)");
    expect(sql).toContain("r.status='lobby'");
  });

  it("distinguishes deliberate host Exit from disconnection", () => {
    const sql = read(migration);
    const lobby = read("src/routes/lobby.tsx");
    expect(sql).toContain("if v_room.host_player_id=v_player then");
    expect(sql).toContain("delete from public.rooms where id=v_room.id");
    expect(lobby).toContain("const leave = async () =>");
    expect(lobby).toContain("leaveWaitingRoom");
    expect(lobby).toContain('to: "/join"');
    expect(lobby).not.toContain("RoomCodeCard");
  });

  it("locks concurrent human seat claims to one lobby/game at a time", () => {
    const sql = read(migration);
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("public.room_seats");
    expect(sql).toContain("public.game_participants");
    expect(sql).toContain("ACTIVE_GAME_EXISTS");
    const edge = read("supabase/functions/room-commands/index.ts");
    expect(edge).toContain('action === "list_waiting"');
    expect(edge).toContain('action === "membership"');
    expect(edge).toContain('action === "leave_waiting"');
    expect(edge).toContain('error.code === "23505"');
  });

  it("uses the same secure server session without storing the player's PIN", () => {
    const gate = read("src/components/joker/PlayerSessionGate.tsx");
    const home = read("src/routes/joker.tsx");
    expect(gate).toContain("getCurrentPlayer()");
    expect(gate).toContain("realIdentityService.verifyPin");
    expect(gate).not.toContain("localStorage");
    expect(home).toContain('activeLookup.status === "waiting"');
    expect(home).toContain("allowLogout=");
  });
});
