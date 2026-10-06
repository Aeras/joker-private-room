import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const create = readFileSync("src/routes/create.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261006164500_jk006_multi_host_create_ai_owner.sql",
  "utf8",
);

describe("multi-host create authorization", () => {
  it("shows a player dropdown before PIN verification", () => {
    expect(create).toContain('aria-label="Παίκτης"');
    expect(create).toContain("players.map((player)");
    expect(create).toContain("realIdentityService.verifyPin(host.id, pin)");
    expect(create).not.toContain('result.player.role !== "host"');
  });

  it("shows and submits AI only for Ζωάλο Πουτς", () => {
    expect(create).toContain(
      'const AI_BANTER_CREATOR_PLAYER_ID = "a1f36a77-1732-44d4-8c3b-4623a6e6ed0c"',
    );
    expect(create).toContain(
      "verifiedHost.id === AI_BANTER_CREATOR_PLAYER_ID && (",
    );
    expect(create).toContain(
      "aiEnabled: botsTalk && verifiedHost.id === AI_BANTER_CREATOR_PLAYER_ID && aiEnabled",
    );
  });

  it("authorizes exactly the three requested creators server-side", () => {
    for (const id of [
      "12302475-c4da-491c-9081-08c039384ac1",
      "a1f36a77-1732-44d4-8c3b-4623a6e6ed0c",
      "61208d95-f090-4290-8e0f-b1f9de40f84f",
    ]) {
      expect(migration).toContain(id);
    }
    expect(migration).toContain("v_player_id not in (");
  });

  it("rejects AI and Panagiotis Special for non-owner creators", () => {
    expect(migration).toContain("if p_ai_enabled");
    expect(migration).toContain(
      "v_player_id <> 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid",
    );
    expect(migration).toContain("if p_ruleset_id = 'panagiotis'");
    expect(migration).toContain("'NOT_HOST'");
  });

  it("keeps the privileged RPCs service-role only", () => {
    expect(migration).toContain(
      "revoke all on function public.get_available_rulesets_internal(text)",
    );
    expect(migration).toContain(
      "revoke all on function public.create_room_internal(text, uuid, text, boolean, boolean, boolean, text)",
    );
    expect(migration).toContain("to service_role");
  });
});
