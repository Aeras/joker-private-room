import type { PublicPlayer } from "@/domain/players";
import { getBackend } from "@/integrations/external-supabase/client";
import { authenticatePlayer } from "./authFunctions";
import type { IdentityService } from "./identity";

const mapPlayer = (p: { id: string; display_name: string; is_host: boolean }): PublicPlayer => ({
  id: p.id,
  displayName: p.display_name,
  role: p.is_host ? "host" : "player",
});

export const realIdentityService: IdentityService = {
  async listPlayers(): Promise<PublicPlayer[]> {
    const { data, error } = await getBackend().rpc("list_active_players");
    if (error) throw error;
    return (data ?? []).map(mapPlayer);
  },

  async verifyPin(playerId, pin) {
    if (!/^\d{4}$/.test(pin)) return { ok: false, code: "INVALID_CREDENTIALS" };
    return authenticatePlayer({ data: { playerId, pin } });
  },
};
