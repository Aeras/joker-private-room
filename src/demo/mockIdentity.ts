/**
 * DEMO ONLY. Mock identities with no real PINs.
 * Any 4-digit PIN is accepted. Delete when the real backend is connected.
 */
import type { PublicPlayer } from "@/domain/players";
import type { IdentityService } from "@/services/identity";

export const DEMO_PLAYERS: PublicPlayer[] = [
  { id: "demo-nikos", displayName: "Νίκος", role: "host" },
  { id: "demo-michalis", displayName: "Μιχάλης", role: "player" },
  { id: "demo-giorgos", displayName: "Γιώργος", role: "player" },
  { id: "demo-panagiotis", displayName: "Παναγιώτης", role: "player" },
];

export const DEMO_HOST: PublicPlayer = DEMO_PLAYERS[0]!;
export const DEMO_FRIEND: PublicPlayer = DEMO_PLAYERS[1]!;

export const mockIdentityService: IdentityService = {
  async listPlayers() {
    return DEMO_PLAYERS;
  },
  async verifyPin(playerId, pin) {
    const player = DEMO_PLAYERS.find((p) => p.id === playerId);
    if (!player || !/^\d{4}$/.test(pin)) return { ok: false, code: "INVALID_CREDENTIALS" };
    return { ok: true, player };
  },
};
