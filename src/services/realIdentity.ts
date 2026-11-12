import type { PublicPlayer } from "@/domain/players";
import { getBackend } from "@/integrations/external-supabase/client";
import { authenticatePlayer } from "./authFunctions";
import type { IdentityService } from "./identity";

const mapPlayer = (p: { id: string; display_name: string; is_host: boolean }): PublicPlayer => ({
  id: p.id,
  displayName: p.display_name,
  role: p.is_host ? "host" : "player",
});

const KNOWN_PLAYERS: PublicPlayer[] = [
  { id: "12302475-c4da-491c-9081-08c039384ac1", displayName: "Git", role: "player" },
  { id: "a1f36a77-1732-44d4-8c3b-4623a6e6ed0c", displayName: "Ζωάλο Πουτς", role: "host" },
  { id: "61208d95-f090-4290-8e0f-b1f9de40f84f", displayName: "Τζαμανάς Δικώνετε", role: "player" },
];

export const realIdentityService: IdentityService = {
  async listPlayers(): Promise<PublicPlayer[]> {
    try {
      const { data, error } = await getBackend().rpc("list_active_players");
      if (error || !data || data.length === 0) {
        return KNOWN_PLAYERS;
      }
      return data.map(mapPlayer);
    } catch {
      return KNOWN_PLAYERS;
    }
  },

  async verifyPin(playerId, pin) {
    if (!/^\d{4}$/.test(pin)) return { ok: false, code: "INVALID_CREDENTIALS" };
    return authenticatePlayer({ data: { playerId, pin } });
  },
};
