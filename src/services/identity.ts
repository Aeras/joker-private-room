/**
 * Identity abstraction. Production: predefined players in the backend,
 * PIN verified server-side. NEVER put real PINs in frontend code.
 */
import type { PublicPlayer } from "@/domain/players";

export interface PlayerSession {
  player: PublicPlayer;
  /** Opaque backend session token in production. */
  token: string;
}

export interface IdentityService {
  listPlayers(): Promise<PublicPlayer[]>;
  verifyPin(playerId: string, pin: string): Promise<PlayerSession | null>;
}
